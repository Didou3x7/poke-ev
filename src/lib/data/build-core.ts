import { computeSetEv } from "../ev/engine";
import type { PricedCard, PullRateConfig } from "../ev/types";
import type { CatalogSet } from "./schemas";
import type { PriceProvider, ProviderSet } from "./provider";
import type { Snapshot, SnapshotSet, SnapshotSetEv } from "./snapshot-types";

/**
 * Snapshot builder — shared by the CLI script and the Vercel cron route.
 *
 * Budget strategy (Basic plan: 100 req/day): one call lists the episodes, then
 * each refreshed set costs exactly 2 calls (cards + products). Sets carrying a
 * pull-rate file are refreshed in rotation starting at `prior.cursor`, newest
 * first, so a small daily budget still cycles through the whole EV catalog
 * every few days. Sets not refreshed today keep their previous snapshot data.
 */

export interface BuildInput {
  provider: PriceProvider;
  prior: Snapshot;
  catalogSets: CatalogSet[];
  pullRates: Map<string, PullRateConfig>;
  /** Max provider HTTP calls for this run (the provider enforces it too). */
  budget: number;
  now?: Date;
  log?: (message: string) => void;
}

export interface BuildResult {
  snapshot: Snapshot;
  refreshed: string[];
  unmatched: string[];
  callsUsed: number;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function matchEpisode(set: CatalogSet, episodes: ProviderSet[]): ProviderSet | null {
  const targets = [set.apiMatch, set.nameEn].filter(Boolean).map((n) => normalizeName(n!));
  for (const target of targets) {
    const exact = episodes.find((e) => normalizeName(e.name) === target);
    if (exact) return exact;
  }
  for (const target of targets) {
    const partial = episodes.filter(
      (e) => normalizeName(e.name).includes(target) || target.includes(normalizeName(e.name)),
    );
    if (partial.length === 1) return partial[0];
  }
  return null;
}

function toSnapshotEv(cards: PricedCard[], config: PullRateConfig, market: "fr" | "en"): SnapshotSetEv {
  const ev = computeSetEv(cards, config, market, { topCardsCount: 12 });
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

export async function fetchFxRate(fetchImpl: typeof fetch = fetch): Promise<{ eurUsd: number; asOf: string } | null> {
  try {
    const res = await fetchImpl("https://api.frankfurter.app/latest?from=EUR&to=USD");
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: { USD?: number }; date?: string };
    if (!data.rates?.USD) return null;
    return { eurUsd: data.rates.USD, asOf: data.date ?? new Date().toISOString().slice(0, 10) };
  } catch {
    return null;
  }
}

export async function buildSnapshot(input: BuildInput): Promise<BuildResult> {
  const { provider, prior, catalogSets, pullRates, budget } = input;
  const log = input.log ?? (() => {});
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  // Sets eligible for EV refresh: those with documented pull rates, newest first.
  const evSets = catalogSets
    .filter((s) => pullRates.has(s.id))
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));

  if (evSets.length === 0) {
    log("no sets with pull rates — nothing to refresh");
    return { snapshot: { ...prior, generatedAt: nowIso }, refreshed: [], unmatched: [], callsUsed: 0 };
  }

  const episodes = await provider.listSets(); // 1 call
  log(`episodes listed: ${episodes.length} (1 call)`);

  const sets: Record<string, SnapshotSet> = { ...prior.sets };
  const refreshed: string[] = [];
  const unmatched: string[] = [];

  const start = prior.cursor % evSets.length;
  for (let i = 0; i < evSets.length; i++) {
    if (provider.callsUsed() + 2 > budget) break;
    const set = evSets[(start + i) % evSets.length];
    const config = pullRates.get(set.id)!;
    const episode = matchEpisode(set, episodes);
    if (!episode) {
      unmatched.push(set.id);
      log(`✗ no episode match for ${set.id} ("${set.apiMatch ?? set.nameEn}")`);
      continue;
    }
    try {
      const cards = await provider.cards(episode.externalId);
      const sealed = await provider.sealedProducts(episode.externalId);
      sets[set.id] = {
        setId: set.id,
        episodeId: episode.externalId,
        logo: episode.logo,
        symbol: episode.symbol,
        ev: { fr: toSnapshotEv(cards, config, "fr"), en: toSnapshotEv(cards, config, "en") },
        pullRateConfidence: config.confidence,
        sealed: sealed.map((p) => ({
          kind: p.kind,
          name: p.name,
          eur: p.prices.eur,
          usd: p.prices.usd,
          image: p.image ?? null,
        })),
        cards: cards.map((c) => ({
          id: c.id,
          name: c.name,
          nameFr: null,
          number: c.number,
          rarity: c.rarity,
          rawRarity: c.rawRarity,
          eur: c.prices.eur,
          usd: c.prices.usd,
          image: c.image,
        })),
        updatedAt: nowIso,
      };
      refreshed.push(set.id);
      log(`✓ ${set.id} — ${cards.length} cards, ${sealed.length} sealed (calls: ${provider.callsUsed()})`);
    } catch (e) {
      log(`✗ ${set.id} failed: ${(e as Error).message}`);
    }
  }

  const fx = (await fetchFxRate()) ?? prior.fx;

  return {
    snapshot: {
      version: 1,
      generatedAt: nowIso,
      demo: false,
      fx,
      sets,
      cursor: (start + refreshed.length + unmatched.length) % evSets.length,
    },
    refreshed,
    unmatched,
    callsUsed: provider.callsUsed(),
  };
}
