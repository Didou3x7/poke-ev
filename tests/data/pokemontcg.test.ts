import { describe, expect, it } from "vitest";
import { overlayPtcgPrices, ptcgUsd, type PtcgApiCard, type PtcgCard } from "@/lib/data/pokemontcg";
import type { PricedCard } from "@/lib/ev/types";

// A pokemontcg.io API card with the given printing→market prices.
const apiCard = (rarity: string | null, prices: Record<string, number>): PtcgApiCard => ({
  number: "1",
  name: "X",
  rarity,
  tcgplayer: { prices: Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, { market: v }])) },
});

describe("ptcgUsd — price the printing that matches the card's rarity", () => {
  it("a non-holo common/uncommon takes `normal`, NEVER the reverse-holo (Legendary Collection bug)", () => {
    // LC Magikarp: base ~$2 normal, but a $700 reverse holo. The base card must price at $2.
    expect(ptcgUsd(apiCard("Uncommon", { normal: 2.04, reverseHolofoil: 699.99 }))).toBe(2.04);
    expect(ptcgUsd(apiCard("Common", { normal: 0.5, reverseHolofoil: 490.24 }))).toBe(0.5);
    expect(ptcgUsd(apiCard("Rare", { normal: 3, reverseHolofoil: 120 }))).toBe(3);
  });

  it("a holo / hit rare takes the holofoil, not the cheap normal", () => {
    expect(ptcgUsd(apiCard("Rare Holo", { holofoil: 499, reverseHolofoil: 30, normal: 1 }))).toBe(499);
    expect(ptcgUsd(apiCard("Rare Holo EX", { holofoil: 80, normal: 2 }))).toBe(80);
  });

  it("falls back to whatever printing exists when the preferred one is absent", () => {
    // A card sold solely as a reverse holo (no normal) still gets priced.
    expect(ptcgUsd(apiCard("Common", { reverseHolofoil: 12 }))).toBe(12);
    // A holo rare listed only as normal still gets priced.
    expect(ptcgUsd(apiCard("Rare Holo", { normal: 7 }))).toBe(7);
  });

  it("an unknown/null rarity stays conservative (base printing, never inflates)", () => {
    expect(ptcgUsd(apiCard(null, { normal: 2, reverseHolofoil: 300 }))).toBe(2);
  });

  it("returns null when there are no usable prices", () => {
    expect(ptcgUsd(apiCard("Common", {}))).toBeNull();
    expect(ptcgUsd({ number: "1", name: "X", rarity: "Common" })).toBeNull();
  });
});

const card = (o: { number: string; name: string; eur?: number | null; usd?: number | null; image?: string | null }): PricedCard => ({
  id: o.number,
  name: o.name,
  number: o.number,
  rarity: null,
  rawRarity: null,
  prices: { eur: o.eur ?? null, usd: o.usd ?? null },
  image: o.image ?? null,
});

const p = (o: Partial<PtcgCard> & { number: string; name: string }): PtcgCard => ({
  image: null,
  eur: null,
  usd: null,
  rarity: null,
  ...o,
});

describe("overlayPtcgPrices", () => {
  it("overlays prices and fills a missing image on an exact number match", () => {
    const cards = [card({ number: "199", name: "Charizard ex", eur: 3, usd: 4 })];
    const matched = overlayPtcgPrices(cards, [p({ number: "199", name: "Charizard ex", eur: 235, usd: 494, image: "img" })]);
    expect(matched).toBe(1);
    expect(cards[0].prices).toEqual({ eur: 235, usd: 494 });
    expect(cards[0].image).toBe("img");
  });

  it("matches across zero-padding (TCGdex 072 ↔ pokemontcg 72)", () => {
    const cards = [card({ number: "072", name: "Mewtwo V", eur: 4.28, usd: 65 })];
    overlayPtcgPrices(cards, [p({ number: "72", name: "Mewtwo V", eur: 48, usd: 65 })]);
    expect(cards[0].prices.eur).toBe(48);
  });

  it("falls back to a unique name match when numbers differ (Celebrations 4A ↔ 4)", () => {
    const cards = [card({ number: "4A", name: "Charizard", eur: 204.9, usd: null, image: null })];
    overlayPtcgPrices(cards, [p({ number: "4", name: "Charizard", eur: null, usd: 208.58, image: "ptcg-img" })]);
    expect(cards[0].prices.usd).toBe(208.58); // pokemontcg USD overlaid
    expect(cards[0].prices.eur).toBe(204.9); // pokemontcg EUR null → keep TCGdex Cardmarket
    expect(cards[0].image).toBe("ptcg-img"); // image filled where TCGdex had none
  });

  it("matches a Gold Star card across 'Star' word vs ★ symbol (Celebrations 17A ↔ 17)", () => {
    const cards = [card({ number: "17A", name: "Umbreon Star", eur: null, usd: null, image: null })];
    overlayPtcgPrices(cards, [p({ number: "17", name: "Umbreon ★", eur: null, usd: 124.71, image: "ptcg-img" })]);
    expect(cards[0].prices.usd).toBe(124.71);
    expect(cards[0].image).toBe("ptcg-img");
  });

  it("disambiguates same-number candidates by name", () => {
    const cards = [card({ number: "15", name: "Lunala", eur: 1, usd: 1 })];
    overlayPtcgPrices(cards, [
      p({ number: "15", name: "Venusaur", eur: 99, usd: 99 }),
      p({ number: "15", name: "Lunala", eur: 19, usd: 20 }),
    ]);
    expect(cards[0].prices).toEqual({ eur: 19, usd: 20 });
  });

  it("fills a null rarity from pokemontcg only when it is a genuine hit", () => {
    const lvx = [card({ number: "120", name: "Dialga LV.X" })]; // card() sets rarity null
    overlayPtcgPrices(lvx, [p({ number: "120", name: "Dialga LV.X", rarity: "Rare Holo LV.X" })]);
    expect(lvx[0].rarity).toBe("lv-x");

    const junk = [card({ number: "1", name: "Bidoof" })]; // null rarity, ptcg says plain Rare
    overlayPtcgPrices(junk, [p({ number: "1", name: "Bidoof", rarity: "Rare" })]);
    expect(junk[0].rarity).toBeNull(); // not a hit → left null (no false upgrade)
  });

  it("sharpens TCGdex 'rare' to a vintage hit but never downgrades", () => {
    const ex = [{ ...card({ number: "97", name: "Rayquaza ex" }), rarity: "rare" as const }];
    overlayPtcgPrices(ex, [p({ number: "97", name: "Rayquaza ex", rarity: "Rare Holo EX" })]);
    expect(ex[0].rarity).toBe("ex");

    const plain = [{ ...card({ number: "5", name: "Pikachu" }), rarity: "rare" as const }];
    overlayPtcgPrices(plain, [p({ number: "5", name: "Pikachu", rarity: "Rare" })]);
    expect(plain[0].rarity).toBe("rare"); // same tier → unchanged
  });

  it("keeps TCGdex prices when there is no match", () => {
    const cards = [card({ number: "5", name: "Pikachu", eur: 1, usd: 2 })];
    const matched = overlayPtcgPrices(cards, [p({ number: "99", name: "Snorlax", eur: 10, usd: 12 })]);
    expect(matched).toBe(0);
    expect(cards[0].prices).toEqual({ eur: 1, usd: 2 });
    expect(cards[0].image).toBeNull();
  });
});
