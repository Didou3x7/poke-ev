import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeSetEv } from "../ev/engine";
import { reclassifyVintageShiny } from "../ev/rarity";
import type { PricedCard, SetEv } from "../ev/types";
import { getAllSets, getEraOfSet, getPullRates } from "./catalog";
import { fetchFxRate } from "./build-core";
import { TcgdexProvider, fetchSetCardNames, mapLimit } from "./tcgdex";
import { fetchPtcgCards, overlayPtcgPrices } from "./pokemontcg";
import { reconcileCardPrices } from "./reconcile-prices";
import type { Snapshot, SnapshotSet, SnapshotSetEv } from "./snapshot-types";

/**
 * Builds a full real-price snapshot from TCGdex (free, no API key): real
 * Cardmarket EUR + TCGPlayer USD prices per card → real EV for every set with
 * documented pull rates. Where one marketplace doesn't quote a card, the other
 * is converted at the day's FX rate so both FR and EN EVs stay real and
 * complete. Shared by the CLI script and the Vercel cron route.
 */


function snapshotEv(ev: SetEv): SnapshotSetEv {
  return {
    packEv: ev.packEv,
    packStdDev: ev.packStdDev,
    priceCompleteness: ev.priceCompleteness,
    unknownRarityCards: ev.unknownRarityCards,
    rarityBreakdown: ev.rarityBreakdown,
    topCards: ev.topCards.map((c) => ({
      cardId: c.card.id,
      probabilityPerPack: c.probabilityPerPack,
      value: c.value,
      evContribution: c.evContribution,
    })),
  };
}

export function loadTcgdexMap(): Record<string, string> {
  const path = join(process.cwd(), "data", "sources", "tcgdex-sets.json");
  const map = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  delete (map as Record<string, unknown>)._comment;
  return map;
}

/** catalogId → pokemontcg.io set id(s), for the real-price + image overlay. */
export function loadPtcgMap(): Record<string, string[]> {
  try {
    const path = join(process.cwd(), "data", "sources", "pokemontcg-sets.json");
    const map = JSON.parse(readFileSync(path, "utf8")) as Record<string, string[]>;
    delete (map as Record<string, unknown>)._comment;
    return map;
  } catch {
    return {};
  }
}

/**
 * Lowercased EN card name → FR name, learned from TCGdex FR data across all
 * sets. Used as a fallback for sets TCGdex never localized to French (Gym, EX
 * Team Rocket Returns, Arceus, BW Legendary Treasures…), so those Pokémon still
 * show their French name (e.g. Charizard → Dracaufeu) instead of English.
 */
export function loadFrNameDict(): Record<string, string> {
  try {
    const path = join(process.cwd(), "data", "sources", "fr-names.json");
    const map = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
    delete (map as Record<string, unknown>)._comment;
    return map;
  } catch {
    return {};
  }
}

/**
 * catalogId → { collectorNumber → official FR card name }. Authoritative FR
 * names sourced (jcc.pokemon.tf) for French-released sets TCGdex never localized
 * (Gym Heroes/Challenge, EX Team Rocket Returns, Arceus, Legendary Treasures) —
 * e.g. "Sabrina's Gengar" #14 → "Ectoplasma de Morgane". Fills by number where
 * TCGdex has no FR name; takes priority over the EN→FR Pokémon-name fallback.
 */
export function loadFrBySet(): Record<string, Record<string, string>> {
  try {
    const path = join(process.cwd(), "data", "sources", "fr-names-by-set.json");
    const map = JSON.parse(readFileSync(path, "utf8")) as Record<string, Record<string, string>>;
    delete (map as Record<string, unknown>)._comment;
    return map;
  } catch {
    return {};
  }
}

export interface TcgdexBuildOptions {
  prior?: Snapshot;
  only?: string[];
  concurrency?: number;
  /** How many sets to build in parallel. Overlaps the per-set network waits
   *  (notably pokemontcg.io rate-limit backoff) so the full 128-set refresh
   *  finishes inside the cron's function-time budget. */
  setConcurrency?: number;
  /** Soft wall-clock budget (ms). Past it, stop starting new sets and return
   *  what's done — unreached sets keep their prior data. Lets a tight serverless
   *  function persist partial progress instead of timing out mid-build. */
  maxMillis?: number;
  /** Called after every `persistEvery` sets complete, with the in-progress
   *  snapshot — the caller can persist it so a later timeout can't lose work. */
  onProgress?: (snapshot: Snapshot, done: number, total: number) => Promise<void> | void;
  /** Sets between onProgress callbacks (default 25). */
  persistEvery?: number;
  log?: (message: string) => void;
}

export async function buildTcgdexSnapshot(options: TcgdexBuildOptions = {}): Promise<Snapshot> {
  const log = options.log ?? (() => {});
  const map = loadTcgdexMap();
  const ptcgMap = loadPtcgMap();
  const frDict = loadFrNameDict();
  const frBySet = loadFrBySet();
  const provider = new TcgdexProvider(map, { concurrency: options.concurrency ?? 16 });
  const pullRates = getPullRates();
  const nowIso = new Date().toISOString();
  const sets: Record<string, SnapshotSet> = { ...(options.prior?.sets ?? {}) };

  const fx = (await fetchFxRate()) ?? options.prior?.fx ?? { eurUsd: 1.08, asOf: nowIso.slice(0, 10) };

  // Every catalog set with a TCGdex mapping is refreshed — even without a
  // pull-rate file. Such a set gets real card + sealed prices and a chase card,
  // but ev:null (EV indisponible) until a sourced pull-rate file is added.
  // Stalest-first: a partial run (deadline hit) then refreshes the most
  // out-of-date sets, so even on a tight budget every set cycles through fast.
  const targets = getAllSets()
    .filter((s) => map[s.id] && (!options.only || options.only.includes(s.id)))
    .sort((a, b) =>
      (options.prior?.sets[a.id]?.updatedAt ?? "").localeCompare(options.prior?.sets[b.id]?.updatedAt ?? ""),
    );
  log(`TCGdex: ${targets.length} mapped sets to refresh (fx EUR→USD ${fx.eurUsd})`);

  const startMs = Date.now();
  const persistEvery = options.persistEvery ?? 25;
  const snapshotNow = (): Snapshot => ({ version: 1, generatedAt: nowIso, demo: false, fx, sets, cursor: 0 });
  let done = 0;
  let skipped = 0;
  // Build sets in parallel. tcgdex is keyless/generous; the slow part is the
  // sequential pokemontcg.io backoff, and running several sets at once overlaps
  // those waits so the whole catalog fits in one cron run. Modest fan-out keeps
  // us a polite client (each set still fans out internally up to `concurrency`).
  await mapLimit(targets, options.setConcurrency ?? 6, async (set) => {
    // Past the soft deadline: stop starting new sets (they keep prior data).
    if (options.maxMillis != null && Date.now() - startMs > options.maxMillis) {
      skipped++;
      return;
    }
    // A set may draw from several TCGdex sets joined with "+" (e.g. Hidden Fates
    // main + Shiny Vault: "sm115+sma"). The first id is primary — it drives the
    // logo, episodeId and FR names; cards from every id are merged.
    const tcgdexIds = map[set.id].split("+");
    const primaryId = tcgdexIds[0];
    const config = pullRates.get(set.id);
    try {
      const [rawCardsArr, frNameMaps, ptcgCards] = await Promise.all([
        Promise.all(tcgdexIds.map((id) => provider.cards(id))),
        Promise.all(tcgdexIds.map((id) => fetchSetCardNames(id, "fr"))),
        ptcgMap[set.id] ? fetchPtcgCards(ptcgMap[set.id]) : Promise.resolve([]),
      ]);
      const rawCards = rawCardsArr.flat();
      const frNames = new Map<string, string>(frNameMaps.flatMap((m) => [...m]));
      // If pokemontcg.io is unavailable for a mapped set (rate-limited/down),
      // keep the prior overlaid snapshot rather than degrade to TCGdex-only
      // (which would revert correct prices + re-break image-gap chases).
      if (ptcgMap[set.id] && ptcgCards.length === 0 && options.prior?.sets[set.id]) {
        log(`↺ ${set.id} — pokemontcg.io unavailable, keeping prior data`);
        return;
      }
      // Overlay real, per-printing pokemontcg.io prices (fixes TCGdex's
      // variant-mixed EUR/USD) and fill any images TCGdex lacks; keep TCGdex
      // FR/EN prints + names. Only then convert across currencies for the few
      // cards still missing one market, so EV stays complete.
      const base: PricedCard[] = rawCards.map((c) => ({ ...c, prices: { ...c.prices } }));
      // Vintage sets (pre-Black & White, ~2011) have old, crooked TCGdex card
      // photographs; replace them with pokemontcg.io's clean, straight scans.
      // Modern sets keep TCGdex (already clean AND carrying French prints).
      const useCleanScans = set.releaseDate < "2011-01-01";
      const matched = overlayPtcgPrices(base, ptcgCards, useCleanScans);
      const cards: PricedCard[] = base.map((c) => {
        // Fill a missing market at FX, repair a stale-frozen Cardmarket EUR from
        // the fresh USD, then clamp wild EUR/USD divergence (a Cardmarket/TCGplayer
        // data artifact — e.g. €140 vs $0.44 on a common). See ./reconcile-prices.
        const lowRarity = c.rarity === "common" || c.rarity === "uncommon";
        const { eur, usd } = reconcileCardPrices(c.prices.eur ?? null, c.prices.usd ?? null, {
          eurUsd: fx.eurUsd,
          lowRarity,
          eurAsOf: c.eurAsOf,
          nowMs: startMs,
        });
        // Gallery subsets pull from a dedicated slot but TCGdex tags them with
        // ordinary rarities (rare/ultra/secret). Their collector numbers are the
        // reliable marker (TG01.., GG01..), so reclassify by prefix to the rarity
        // the pull-rate slot references — else that guaranteed card scores 0 EV.
        const num = c.number != null ? String(c.number) : "";
        let rarity = c.rarity;
        if (/^TG/i.test(num)) rarity = "trainer-gallery";
        else if (/^GG/i.test(num)) rarity = "galarian-gallery";
        // Vintage secret shinies mislabeled "Rare" (Neo "Shining <name>", DP "SH##").
        else rarity = reclassifyVintageShiny(rarity, c.name, num);
        // Dragon Vault's Kyurem #21/20 is the set's secret chase, but both sources tag
        // it "common"; pin it to secret-rare so it leaves the common pool and its
        // dedicated secret slot (data/pull-rates/dragon-vault.json) can reference it.
        if (set.id === "dragon-vault" && num === "21") rarity = "secret-rare";
        return { ...c, rarity, prices: { eur, usd } };
      });
      const fr = config ? computeSetEv(cards, config, "fr", { topCardsCount: 12 }) : null;
      const en = config ? computeSetEv(cards, config, "en", { topCardsCount: 12 }) : null;
      sets[set.id] = {
        setId: set.id,
        episodeId: primaryId,
        logo: `https://assets.tcgdex.net/en/${primaryId.match(/^[a-z]+/)![0]}/${primaryId}/logo.webp`,
        symbol: null,
        ev: fr && en ? { fr: snapshotEv(fr), en: snapshotEv(en) } : null,
        pullRateConfidence: config?.confidence ?? null,
        sealed: [],
        cards: cards.map((c) => ({
          id: c.id,
          name: c.name,
          nameFr:
            frNames.get(c.id) ??
            (c.number != null ? frNames.get(c.number) ?? null : null) ??
            (c.number != null ? frBySet[set.id]?.[c.number] ?? null : null) ??
            frDict[c.name.toLowerCase()] ??
            null,
          number: c.number,
          rarity: c.rarity,
          rawRarity: c.rawRarity,
          eur: c.prices.eur,
          usd: c.prices.usd,
          image: c.image,
        })),
        updatedAt: nowIso,
      };
      done++;
      const evNote = fr && en ? `fr ${fr.packEv.toFixed(2)}€ / en $${en.packEv.toFixed(2)}` : "no pull rates (EV off)";
      log(`✓ ${set.id} (${getEraOfSet(set.id)?.era}) — ${cards.length} cards · ${matched} ptcg · ${evNote}`);
      // Persist partial progress so a later timeout can't lose this run's work.
      if (options.onProgress && done % persistEvery === 0) {
        await options.onProgress(snapshotNow(), done, targets.length);
      }
    } catch (e) {
      log(`✗ ${set.id} failed: ${(e as Error).message}`);
    }
  });

  const note = skipped > 0 ? ` (${skipped} skipped past deadline — kept prior, will lead next run)` : "";
  log(`TCGdex done: ${done}/${targets.length} sets, ${provider.callsUsed()} HTTP calls${note}`);
  return snapshotNow();
}
