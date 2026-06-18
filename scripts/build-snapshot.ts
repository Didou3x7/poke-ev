/**
 * Builds /data/snapshot/snapshot.json.
 *
 *   npm run snapshot                 — real prices via TCGGO (needs RAPIDAPI_KEY)
 *   npm run snapshot -- --budget=50  — cap API calls for this run (default 90)
 *   npm run snapshot -- --demo       — synthetic data, loudly flagged demo:true
 *
 * The cursor stored inside the snapshot spreads refreshes across days, so the
 * 100 req/day Basic plan still cycles through every EV-enabled set.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { TcggoClient } from "../src/lib/api/tcggo";
import { TcggoProvider } from "../src/lib/data/provider";
import { buildSnapshot } from "../src/lib/data/build-core";
import { buildTcgdexSnapshot } from "../src/lib/data/build-tcgdex";
import { mergeSealedPrices } from "../src/lib/data/sealed-merge";
import { TcgcsvProvider } from "../src/lib/data/tcgcsv";
import { getAllSets, getPullRates } from "../src/lib/data/catalog";
import { computeSetEv } from "../src/lib/ev/engine";
import type { PricedCard } from "../src/lib/ev/types";
import type { RarityId } from "../src/lib/ev/rarity";
import { EMPTY_SNAPSHOT, type Snapshot, type SnapshotSet } from "../src/lib/data/snapshot-types";

const OUT_DIR = join(import.meta.dirname, "..", "data", "snapshot");
const OUT_PATH = join(OUT_DIR, "snapshot.json");

function readPrior(): Snapshot {
  if (!existsSync(OUT_PATH)) return EMPTY_SNAPSHOT;
  try {
    return JSON.parse(readFileSync(OUT_PATH, "utf8")) as Snapshot;
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

function writeSnapshot(snapshot: Snapshot): void {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(snapshot));
  const kb = Math.round(Buffer.byteLength(JSON.stringify(snapshot)) / 1024);
  console.log(`→ wrote ${OUT_PATH} (${kb} kB, ${Object.keys(snapshot.sets).length} sets)`);
}

/* ------------------------------- demo mode ------------------------------- */

// Plausible price anchors per rarity (EUR). Demo data only — flagged demo:true
// and surfaced as such in the UI. Never shipped as real numbers.
const DEMO_PRICE: Partial<Record<RarityId, number>> = {
  "common": 0.04, "uncommon": 0.08, "rare": 0.2, "rare-holo": 0.5,
  "double-rare": 1.1, "ultra-rare": 3.5, "illustration-rare": 5.5,
  "special-illustration-rare": 24, "hyper-rare": 11, "ace-spec": 2.5,
  "shiny-rare": 2, "shiny-ultra-rare": 7, "rare-holo-v": 1.8,
  "rare-holo-vmax": 5.5, "rare-holo-vstar": 3.5, "radiant": 2.2,
  "amazing": 2.8, "trainer-gallery": 2.5, "galarian-gallery": 3.5,
  "secret-rare": 7, "rainbow-rare": 9, "gold-rare": 8, "shiny-vault": 4.5,
  "mega-ex": 8, "black-white-rare": 28,
};

const DEMO_POOL_SIZE: Partial<Record<RarityId, number>> = {
  "common": 70, "uncommon": 60, "rare": 24, "rare-holo": 14, "double-rare": 13,
  "ultra-rare": 11, "illustration-rare": 21, "special-illustration-rare": 13,
  "hyper-rare": 3, "ace-spec": 3, "shiny-rare": 12, "shiny-ultra-rare": 6,
  "rare-holo-v": 16, "rare-holo-vmax": 9, "rare-holo-vstar": 7, "radiant": 3,
  "amazing": 3, "trainer-gallery": 25, "galarian-gallery": 25, "secret-rare": 8,
  "rainbow-rare": 8, "gold-rare": 6, "shiny-vault": 20, "mega-ex": 10,
  "black-white-rare": 2,
};

function makeRng(seedText: string) {
  let s = 2166136261;
  for (const ch of seedText) s = (s ^ ch.charCodeAt(0)) * 16777619;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function buildDemoSnapshot(): Snapshot {
  const pullRates = getPullRates();
  const sets: Record<string, SnapshotSet> = {};
  const nowIso = new Date().toISOString();

  for (const set of getAllSets()) {
    const config = pullRates.get(set.id);
    if (!config) continue;
    const rng = makeRng(set.id);
    const rarities = new Set<RarityId>();
    for (const slot of config.slots) {
      for (const r of Object.keys(slot.distribution)) rarities.add(r as RarityId);
    }
    const cards: PricedCard[] = [];
    for (const rarity of rarities) {
      const n = DEMO_POOL_SIZE[rarity] ?? 8;
      const anchor = DEMO_PRICE[rarity] ?? 1;
      for (let i = 1; i <= n; i++) {
        // log-uniform multiplier 0.3×–8× around the anchor
        const eur = Math.round(anchor * Math.exp(Math.log(0.3) + rng() * (Math.log(8) - Math.log(0.3))) * 100) / 100;
        const usd = Math.round(eur * (1.05 + rng() * 0.1) * 100) / 100;
        cards.push({
          id: `${set.id}-${rarity}-${i}`,
          name: `Demo ${rarity} ${i}`,
          number: String(cards.length + 1),
          rarity,
          rawRarity: rarity,
          prices: { eur, usd },
          image: null,
        });
      }
    }
    const fr = computeSetEv(cards, config, "fr", { topCardsCount: 12 });
    const en = computeSetEv(cards, config, "en", { topCardsCount: 12 });
    const toEv = (ev: typeof fr) => ({
      packEv: ev.packEv,
      packStdDev: ev.packStdDev,
      priceCompleteness: ev.priceCompleteness,
      unknownRarityCards: ev.unknownRarityCards,
      rarityBreakdown: ev.rarityBreakdown,
      topCards: ev.topCards.map((c) => ({
        cardId: c.card.id, probabilityPerPack: c.probabilityPerPack,
        value: c.value, evContribution: c.evContribution,
      })),
    });
    const sealed: SnapshotSet["sealed"] = [];
    const display = config.products.display;
    if (display) {
      sealed.push({
        kind: "display", name: "Booster display (demo)",
        eur: Math.round(fr.packEv * display.packs * (0.85 + rng() * 0.4) * 100) / 100,
        usd: Math.round(en.packEv * display.packs * (0.85 + rng() * 0.4) * 100) / 100,
        image: null,
      });
    }
    sealed.push({
      kind: "booster", name: "Booster (demo)",
      eur: Math.round(fr.packEv * (1.0 + rng() * 0.4) * 100) / 100,
      usd: Math.round(en.packEv * (1.0 + rng() * 0.4) * 100) / 100,
      image: null,
    });
    if (config.products.etb) {
      sealed.push({
        kind: "etb", name: "Elite Trainer Box (demo)",
        eur: Math.round(fr.packEv * config.products.etb.packs * (1.2 + rng() * 0.5) * 100) / 100,
        usd: Math.round(en.packEv * config.products.etb.packs * (1.2 + rng() * 0.5) * 100) / 100,
        image: null,
      });
    }
    sets[set.id] = {
      setId: set.id, episodeId: null, logo: null, symbol: null,
      ev: { fr: toEv(fr), en: toEv(en) },
      pullRateConfidence: config.confidence,
      sealed,
      cards: cards.map((c) => ({
        id: c.id, name: c.name, nameFr: null, number: c.number, rarity: c.rarity,
        rawRarity: c.rawRarity, eur: c.prices.eur, usd: c.prices.usd, image: c.image,
      })),
      updatedAt: nowIso,
    };
  }

  return {
    version: 1, generatedAt: nowIso, demo: true,
    fx: { eurUsd: 1.08, asOf: nowIso.slice(0, 10) },
    sets, cursor: 0,
  };
}

/* --------------------------------- main ---------------------------------- */

async function main() {
  const args = process.argv.slice(2);
  const demo = args.includes("--demo");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.split("=")[1].split(",") : undefined;
  const source = args.find((a) => a.startsWith("--source="))?.split("=")[1] ?? "tcgdex";

  if (demo) {
    console.log("DEMO mode — synthetic data, flagged demo:true");
    writeSnapshot(buildDemoSnapshot());
    return;
  }

  // --recompute-ev: re-run the EV engine over the existing snapshot's cards (no
  // network). Use after an EV-engine change to refresh packEv/topCards/breakdown
  // without re-fetching prices, so the effect is isolated from market drift.
  if (args.includes("--recompute-ev")) {
    const snapshot = readPrior();
    const pullRates = getPullRates();
    const toEv = (ev: ReturnType<typeof computeSetEv>) => ({
      packEv: ev.packEv,
      packStdDev: ev.packStdDev,
      priceCompleteness: ev.priceCompleteness,
      unknownRarityCards: ev.unknownRarityCards,
      rarityBreakdown: ev.rarityBreakdown,
      topCards: ev.topCards.map((c) => ({
        cardId: c.card.id, probabilityPerPack: c.probabilityPerPack,
        value: c.value, evContribution: c.evContribution,
      })),
    });
    let recomputed = 0;
    for (const set of Object.values(snapshot.sets)) {
      const config = pullRates.get(set.setId);
      if (!config) continue;
      const cards: PricedCard[] = set.cards.map((c) => ({
        id: c.id, name: c.name, number: c.number, rarity: c.rarity as RarityId | null,
        rawRarity: c.rawRarity, prices: { eur: c.eur, usd: c.usd }, image: c.image,
      }));
      set.ev = {
        fr: toEv(computeSetEv(cards, config, "fr", { topCardsCount: 12 })),
        en: toEv(computeSetEv(cards, config, "en", { topCardsCount: 12 })),
      };
      recomputed++;
    }
    console.log(`recompute-ev: ${recomputed} sets re-scored (no network)`);
    writeSnapshot(snapshot);
    return;
  }

  // --sealed-only: refresh just the sealed[] of the existing snapshot (TCGCSV +
  // estimate-fill). Fast — no TCGdex/pokemontcg card rebuild, prices untouched.
  if (args.includes("--sealed-only")) {
    const snapshot = readPrior();
    const provider = new TcgcsvProvider({ eurUsd: snapshot.fx?.eurUsd });
    const res = await mergeSealedPrices({
      snapshot,
      provider,
      catalogSets: getAllSets(),
      pullRates: getPullRates(),
      budget: 1000,
      log: console.log,
    });
    console.log(`sealed-only (tcgcsv): ${res.matched.length} matched, ${res.unmatched.length} unmatched`);
    writeSnapshot(res.snapshot);
    return;
  }

  // Default source: TCGdex (free, real prices, no key). Use --source=tcggo for
  // the RapidAPI path (full rebuild from RapidAPI, needs a paid key).
  if (source === "tcgdex") {
    let snapshot = await buildTcgdexSnapshot({ prior: readPrior(), only, log: console.log });
    // Sealed-product prices from TCGCSV (free TCGplayer mirror, no key, no limit).
    // Cards stay from TCGdex. --no-sealed skips it.
    if (!args.includes("--no-sealed")) {
      const provider = new TcgcsvProvider({ eurUsd: snapshot.fx?.eurUsd });
      const res = await mergeSealedPrices({
        snapshot,
        provider,
        catalogSets: getAllSets(),
        pullRates: getPullRates(),
        budget: 1000,
        log: console.log,
      });
      snapshot = res.snapshot;
      console.log(`sealed merge (tcgcsv): ${res.matched.length} matched, ${res.unmatched.length} unmatched`);
    }
    writeSnapshot(snapshot);
    return;
  }

  const budgetArg = args.find((a) => a.startsWith("--budget="));
  const budget = budgetArg ? Number(budgetArg.split("=")[1]) : 90;
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    console.error("RAPIDAPI_KEY missing. Use --source=tcgdex (default, free) or --demo.");
    process.exit(1);
  }

  const provider = new TcggoProvider(new TcggoClient({ apiKey, budget }));
  const result = await buildSnapshot({
    provider,
    prior: readPrior(),
    catalogSets: getAllSets(),
    pullRates: getPullRates(),
    budget,
    log: console.log,
  });
  console.log(
    `refreshed ${result.refreshed.length} set(s), ${result.unmatched.length} unmatched, ${result.callsUsed} API calls`,
  );
  writeSnapshot(result.snapshot);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
