import type { CatalogSet } from "./schemas";
import type { PriceProvider } from "./provider";
import { matchEpisode } from "./build-core";
import type { Snapshot, SnapshotSet } from "./snapshot-types";

/**
 * Enriches an existing snapshot (built from TCGdex) with sealed-product market
 * prices (display / booster / ETB) from a secondary provider — TCGGO/RapidAPI.
 *
 * Card and EV data are left untouched: only each set's `sealed[]` is refreshed.
 * Cost is `1 + N` calls (episodes list + one /products per matched set), so the
 * ~38 EV sets fit well inside the Basic plan's 100 req/day budget in one run.
 * Newest sets first, so a tight budget still covers the recent chase-heavy sets.
 * Sets are only overwritten when the provider returns ≥1 classifiable product,
 * so a transient empty response never wipes good data.
 */
export interface SealedMergeResult {
  snapshot: Snapshot;
  matched: string[];
  unmatched: string[];
  callsUsed: number;
}

export async function mergeSealedPrices(opts: {
  snapshot: Snapshot;
  provider: PriceProvider;
  catalogSets: CatalogSet[];
  /** Hard cap on provider HTTP calls (the provider enforces it too). */
  budget: number;
  log?: (message: string) => void;
}): Promise<SealedMergeResult> {
  const { snapshot, provider, catalogSets, budget } = opts;
  const log = opts.log ?? (() => {});
  const byId = new Map(catalogSets.map((s) => [s.id, s]));

  const episodes = await provider.listSets(); // 1 call
  log(`sealed: ${episodes.length} episodes listed (1 call)`);

  const sets: Record<string, SnapshotSet> = { ...snapshot.sets };
  const matched: string[] = [];
  const unmatched: string[] = [];

  const ids = Object.keys(sets).sort((a, b) =>
    (byId.get(b)?.releaseDate ?? "").localeCompare(byId.get(a)?.releaseDate ?? ""),
  );

  for (const id of ids) {
    if (provider.callsUsed() + 1 > budget) {
      log(`sealed: budget reached, stopping (${provider.callsUsed()} calls)`);
      break;
    }
    const set = byId.get(id);
    if (!set) continue;
    const episode = matchEpisode(set, episodes);
    if (!episode) {
      unmatched.push(id);
      log(`sealed: ✗ no episode match for ${id}`);
      continue;
    }
    try {
      const sealed = await provider.sealedProducts(episode.externalId);
      if (sealed.length > 0) {
        sets[id] = {
          ...sets[id],
          sealed: sealed.map((p) => ({
            kind: p.kind,
            name: p.name,
            eur: p.prices.eur,
            usd: p.prices.usd,
            image: p.image ?? null,
          })),
        };
        matched.push(id);
        log(`sealed: ✓ ${id} — ${sealed.length} product(s) (calls: ${provider.callsUsed()})`);
      } else {
        log(`sealed: – ${id} — no classifiable products (calls: ${provider.callsUsed()})`);
      }
    } catch (e) {
      log(`sealed: ✗ ${id} failed: ${(e as Error).message}`);
    }
  }

  return { snapshot: { ...snapshot, sets }, matched, unmatched, callsUsed: provider.callsUsed() };
}
