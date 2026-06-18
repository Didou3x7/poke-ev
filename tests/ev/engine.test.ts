import { describe, expect, it } from "vitest";
import { computeSetEv } from "@/lib/ev/engine";
import type { PricedCard, PullRateConfig } from "@/lib/ev/types";

function card(id: string, rarity: PricedCard["rarity"], eur: number | null, usd: number | null = eur): PricedCard {
  return { id, name: id, number: null, rarity, rawRarity: rarity, prices: { eur, usd }, image: null };
}

const config: PullRateConfig = {
  setId: "test-set",
  era: "test",
  confidence: "high",
  sources: ["https://example.com"],
  packSize: 3,
  slots: [
    { name: "common", count: 2, distribution: { common: 1 } },
    { name: "rare", count: 1, distribution: { rare: 0.8, "double-rare": 0.2 } },
  ],
  products: { display: { packs: 36 }, etb: { packs: 9 } },
};

const cards: PricedCard[] = [
  card("c1", "common", 0.1),
  card("c2", "common", 0.3),
  card("r1", "rare", 1),
  card("r2", "rare", 3),
  card("d1", "double-rare", 10),
];

describe("computeSetEv", () => {
  it("computes pack EV as Σ expectedPerPack(rarity) × meanValue(rarity)", () => {
    const ev = computeSetEv(cards, config, "fr");
    // commons: 2 × mean(0.1, 0.3)=0.2 → 0.4 ; rare: 0.8 × mean(1,3)=2 → 1.6 ; DR: 0.2 × 10 → 2
    expect(ev.packEv).toBeCloseTo(0.4 + 1.6 + 2.0, 10);
    expect(ev.currency).toBe("EUR");
  });

  it("assigns uniform per-card probability within a rarity", () => {
    const ev = computeSetEv(cards, config, "fr");
    const r1 = ev.topCards.find((c) => c.card.id === "r1");
    expect(r1?.probabilityPerPack).toBeCloseTo(0.8 / 2, 10);
    const d1 = ev.topCards.find((c) => c.card.id === "d1");
    expect(d1?.probabilityPerPack).toBeCloseTo(0.2 / 1, 10);
  });

  it("ranks top cards by market value (most valuable first)", () => {
    const ev = computeSetEv(cards, config, "fr");
    expect(ev.topCards.map((c) => c.card.id)).toEqual(["d1", "r2", "r1", "c2", "c1"]);
    expect(ev.topCards[0].evContribution).toBeCloseTo(2, 10); // still carries its contribution

    // Value sort ≠ contribution sort: a frequent cheap card carries more EV than
    // a rare pricey one, yet the pricey card ranks first (priciest on top).
    const local = [card("cheap", "common", 2), card("pricey", "double-rare", 5)];
    const ev2 = computeSetEv(local, config, "fr");
    expect(ev2.topCards[0].card.id).toBe("pricey"); // 5 € > 2 €
    const cheap = ev2.topCards.find((c) => c.card.id === "cheap")!;
    expect(cheap.evContribution).toBeGreaterThan(ev2.topCards[0].evContribution);
  });

  it("treats unpriced cards as 0 value (lower bound) and reports completeness", () => {
    const withHole = [...cards, card("r3", "rare", null, null)];
    const ev = computeSetEv(withHole, config, "fr");
    // rare mean becomes (1+3+0)/3 → contribution 0.8 × 4/3
    const rare = ev.rarityBreakdown.find((r) => r.rarity === "rare")!;
    expect(rare.meanValue).toBeCloseTo(4 / 3, 10);
    expect(ev.priceCompleteness).toBeCloseTo(5 / 6, 10);
  });

  it("counts cards with unknown rarity without inventing value", () => {
    const withUnknown = [...cards, { ...card("x1", null, 50), rawRarity: "Mystery Rare" }];
    const ev = computeSetEv(withUnknown, config, "fr");
    expect(ev.unknownRarityCards).toBe(1);
    expect(ev.packEv).toBeCloseTo(4.0, 10); // unchanged
  });

  it("folds rare-holo into a config's rare bucket when rare-holo isn't referenced", () => {
    // The overlay can re-tag a set's rares as "rare-holo"; a config that only
    // names "rare" must still pull them (else they'd silently score 0 EV).
    const cfg: PullRateConfig = {
      ...config,
      slots: [{ name: "rare", count: 1, distribution: { rare: 1 } }],
    };
    const set = [card("r1", "rare", 2), card("h1", "rare-holo", 4), card("h2", "rare-holo", 6)];
    const ev = computeSetEv(set, cfg, "fr");
    // pooled mean (2+4+6)/3 = 4, all three contribute
    expect(ev.packEv).toBeCloseTo(4, 10);
    const rare = ev.rarityBreakdown.find((r) => r.rarity === "rare")!;
    expect(rare.cardsInSet).toBe(3);
  });

  it("keeps rare and rare-holo separate when a config references BOTH", () => {
    const cfg: PullRateConfig = {
      ...config,
      slots: [{ name: "rare", count: 1, distribution: { rare: 0.5, "rare-holo": 0.5 } }],
    };
    const set = [card("r1", "rare", 2), card("h1", "rare-holo", 10)];
    const ev = computeSetEv(set, cfg, "fr");
    // separate buckets: 0.5×2 + 0.5×10 = 6 (no folding)
    expect(ev.packEv).toBeCloseTo(6, 10);
    expect(ev.rarityBreakdown.find((r) => r.rarity === "rare")!.cardsInSet).toBe(1);
    expect(ev.rarityBreakdown.find((r) => r.rarity === "rare-holo")!.cardsInSet).toBe(1);
  });

  it("drops mis-priced basic energies from the pull pools but keeps cheap ones", () => {
    const cfg: PullRateConfig = { ...config, slots: [{ name: "c", count: 1, distribution: { common: 1 } }] };
    const set = [
      { ...card("e1", "common", 50), name: "Darkness Energy" }, // mis-tagged holo insert → excluded
      { ...card("e2", "common", 0.1), name: "Fire Energy" }, // genuine cheap common → kept
      card("c1", "common", 0.2),
    ];
    const ev = computeSetEv(set, cfg, "fr");
    const pool = ev.rarityBreakdown.find((r) => r.rarity === "common")!;
    expect(pool.cardsInSet).toBe(2); // Fire Energy + c1, NOT the $50 Darkness Energy
    expect(ev.packEv).toBeCloseTo((0.1 + 0.2) / 2, 6); // mean of the 2 kept, not pulled up by 50
  });

  it("handles a rarity present in rates but absent from the set (0 contribution)", () => {
    const cfg: PullRateConfig = {
      ...config,
      slots: [...config.slots, { name: "ghost", count: 1, distribution: { "hyper-rare": 1 } }],
    };
    const ev = computeSetEv(cards, cfg, "fr");
    const ghost = ev.rarityBreakdown.find((r) => r.rarity === "hyper-rare")!;
    expect(ghost.cardsInSet).toBe(0);
    expect(ghost.evContribution).toBe(0);
  });

  it("uses USD prices for the en market", () => {
    const dual = [card("a", "common", 1, 2)];
    const cfg: PullRateConfig = { ...config, slots: [{ name: "c", count: 1, distribution: { common: 1 } }] };
    expect(computeSetEv(dual, cfg, "fr").packEv).toBeCloseTo(1);
    expect(computeSetEv(dual, cfg, "en").packEv).toBeCloseTo(2);
    expect(computeSetEv(dual, cfg, "en").currency).toBe("USD");
  });

  it("has zero variance when every draw is deterministic", () => {
    const single = [card("a", "common", 2)];
    const cfg: PullRateConfig = { ...config, slots: [{ name: "c", count: 5, distribution: { common: 1 } }] };
    expect(computeSetEv(single, cfg, "fr").packStdDev).toBeCloseTo(0, 10);
  });
});

describe("analytic mean/stddev vs Monte Carlo", () => {
  // Seeded LCG so the test is reproducible.
  function makeRng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }

  it("matches a 200k-pack simulation within tolerance", () => {
    const ev = computeSetEv(cards, config, "fr");
    const rng = makeRng(42);
    const pools = new Map<string, number[]>([
      ["common", [0.1, 0.3]],
      ["rare", [1, 3]],
      ["double-rare", [10]],
    ]);
    const n = 200_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      let pack = 0;
      for (const slot of config.slots) {
        for (let k = 0; k < slot.count; k++) {
          const u = rng();
          let acc = 0;
          for (const [rarity, p] of Object.entries(slot.distribution)) {
            acc += p!;
            if (u < acc) {
              const values = pools.get(rarity)!;
              pack += values[Math.floor(rng() * values.length)];
              break;
            }
          }
        }
      }
      sum += pack;
      sumSq += pack * pack;
    }
    const mcMean = sum / n;
    const mcStd = Math.sqrt(sumSq / n - mcMean * mcMean);
    expect(Math.abs(ev.packEv - mcMean) / mcMean).toBeLessThan(0.01);
    expect(Math.abs(ev.packStdDev - mcStd) / mcStd).toBeLessThan(0.03);
  });
});
