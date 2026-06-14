import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeSetEv } from "../ev/engine";
import type { PricedCard, SetEv } from "../ev/types";
import { getAllSets, getEraOfSet, getPullRates } from "./catalog";
import { fetchFxRate } from "./build-core";
import { TcgdexProvider, fetchSetCardNames } from "./tcgdex";
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

export interface TcgdexBuildOptions {
  prior?: Snapshot;
  only?: string[];
  concurrency?: number;
  log?: (message: string) => void;
}

export async function buildTcgdexSnapshot(options: TcgdexBuildOptions = {}): Promise<Snapshot> {
  const log = options.log ?? (() => {});
  const map = loadTcgdexMap();
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
    const tcgdexId = map[set.id];
    const config = pullRates.get(set.id);
    try {
      const [rawCards, frNames] = await Promise.all([
        provider.cards(tcgdexId),
        fetchSetCardNames(tcgdexId, "fr"),
      ]);
      const cards: PricedCard[] = rawCards.map((c) => ({
        ...c,
        prices: {
          eur: c.prices.eur ?? (c.prices.usd != null ? round2(c.prices.usd / fx.eurUsd) : null),
          usd: c.prices.usd ?? (c.prices.eur != null ? round2(c.prices.eur * fx.eurUsd) : null),
        },
      }));
      const fr = config ? computeSetEv(cards, config, "fr", { topCardsCount: 12 }) : null;
      const en = config ? computeSetEv(cards, config, "en", { topCardsCount: 12 }) : null;
      sets[set.id] = {
        setId: set.id,
        episodeId: tcgdexId,
        logo: `https://assets.tcgdex.net/en/${tcgdexId.match(/^[a-z]+/)![0]}/${tcgdexId}/logo.webp`,
        symbol: null,
        ev: fr && en ? { fr: snapshotEv(fr), en: snapshotEv(en) } : null,
        pullRateConfidence: config?.confidence ?? null,
        sealed: [],
        cards: cards.map((c) => ({
          id: c.id,
          name: c.name,
          nameFr: frNames.get(c.id) ?? (c.number != null ? frNames.get(c.number) ?? null : null),
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
      log(`✓ ${set.id} (${getEraOfSet(set.id)?.era}) — ${cards.length} cards · ${evNote}`);
    } catch (e) {
      log(`✗ ${set.id} failed: ${(e as Error).message}`);
    }
  }

  log(`TCGdex done: ${done}/${targets.length} sets, ${provider.callsUsed()} HTTP calls`);
  return { version: 1, generatedAt: nowIso, demo: false, fx, sets, cursor: 0 };
}
