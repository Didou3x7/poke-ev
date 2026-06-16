import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeSetEv } from "../ev/engine";
import type { PricedCard, SetEv } from "../ev/types";
import { getAllSets, getEraOfSet, getPullRates } from "./catalog";
import { fetchFxRate } from "./build-core";
import { TcgdexProvider, fetchSetCardNames } from "./tcgdex";
import { fetchPtcgCards, overlayPtcgPrices } from "./pokemontcg";
import type { Snapshot, SnapshotSet, SnapshotSetEv } from "./snapshot-types";

/**
 * Builds a full real-price snapshot from TCGdex (free, no API key): real
 * Cardmarket EUR + TCGPlayer USD prices per card → real EV for every set with
 * documented pull rates. Where one marketplace doesn't quote a card, the other
 * is converted at the day's FX rate so both FR and EN EVs stay real and
 * complete. Shared by the CLI script and the Vercel cron route.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

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
  const targets = getAllSets().filter(
    (s) => map[s.id] && (!options.only || options.only.includes(s.id)),
  );
  log(`TCGdex: ${targets.length} mapped sets to refresh (fx EUR→USD ${fx.eurUsd})`);

  let done = 0;
  for (const set of targets) {
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
        continue;
      }
      // Overlay real, per-printing pokemontcg.io prices (fixes TCGdex's
      // variant-mixed EUR/USD) and fill any images TCGdex lacks; keep TCGdex
      // FR/EN prints + names. Only then convert across currencies for the few
      // cards still missing one market, so EV stays complete.
      const base: PricedCard[] = rawCards.map((c) => ({ ...c, prices: { ...c.prices } }));
      const matched = overlayPtcgPrices(base, ptcgCards);
      const cards: PricedCard[] = base.map((c) => {
        let eur = c.prices.eur ?? (c.prices.usd != null ? round2(c.prices.usd / fx.eurUsd) : null);
        let usd = c.prices.usd ?? (c.prices.eur != null ? round2(c.prices.eur * fx.eurUsd) : null);
        // Reconcile wild EUR/USD divergence (a Cardmarket/TCGplayer data artifact
        // — e.g. €140 vs $0.44 on a common). Real modern cards diverge <2×, so a
        // >6× gap means one side is junk; clamp the outlier to the other's value.
        if (eur != null && usd != null && eur > 0 && usd > 0) {
          const ratio = (eur * fx.eurUsd) / usd;
          if (ratio > 6) eur = round2(usd / fx.eurUsd);
          else if (ratio < 1 / 6) usd = round2(eur * fx.eurUsd);
        }
        // Gallery subsets pull from a dedicated slot but TCGdex tags them with
        // ordinary rarities (rare/ultra/secret). Their collector numbers are the
        // reliable marker (TG01.., GG01..), so reclassify by prefix to the rarity
        // the pull-rate slot references — else that guaranteed card scores 0 EV.
        const num = c.number != null ? String(c.number) : "";
        let rarity = c.rarity;
        if (/^TG/i.test(num)) rarity = "trainer-gallery";
        else if (/^GG/i.test(num)) rarity = "galarian-gallery";
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
    } catch (e) {
      log(`✗ ${set.id} failed: ${(e as Error).message}`);
    }
  }

  log(`TCGdex done: ${done}/${targets.length} sets, ${provider.callsUsed()} HTTP calls`);
  return { version: 1, generatedAt: nowIso, demo: false, fx, sets, cursor: 0 };
}
