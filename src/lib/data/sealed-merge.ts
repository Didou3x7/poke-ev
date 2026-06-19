import type { CatalogSet } from "./schemas";
import type { PriceProvider } from "./provider";
import { matchEpisode } from "./build-core";
import type { Snapshot, SnapshotSealed, SnapshotSet } from "./snapshot-types";
import type { ProductKind, PullRateConfig } from "../ev/types";

/**
 * Enriches an existing snapshot (built from TCGdex) with sealed-product market
 * prices (display / booster / ETB) from a secondary provider — TCGCSV.
 *
 * Card and EV data are left untouched: only each set's `sealed[]` is refreshed.
 * Sets are only overwritten when we end up with ≥1 priced product, so a transient
 * empty response never wipes good data.
 *
 * Coverage is then completed so the calculator never shows an empty
 * "sealed market price" field:
 *  - SEALED_GROUP_OVERRIDE pins the TCGCSV group for sets whose name doesn't
 *    fuzzy-match (e.g. "Black & White" → "Black and White", "XY" → "XY Base Set").
 *  - For an offered product the market doesn't actually quote (most vintage
 *    booster *boxes* never trade — only the loose pack is priced), we DERIVE an
 *    estimate from the real per-pack price × the pack count and flag it
 *    `estimated: true` (the UI shows a "≈ / estimated" marker).
 *  - SEALED_PACK_ANCHOR_USD supplies a researched per-pack anchor for the handful
 *    of ultra-vintage sets the market quotes no sealed product for at all.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Catalog id → TCGCSV (TCGplayer) groupId, for sets that don't fuzzy-match. */
const SEALED_GROUP_OVERRIDE: Record<string, number> = {
  "black-white": 1400, // "Black and White"
  "diamond-pearl": 1430, // "Diamond and Pearl"
  "ex-ruby-sapphire": 1393, // "Ruby and Sapphire"
  "ex-team-rocket-returns": 1428, // "Team Rocket Returns"
  "ex-dragon-frontiers": 1411, // "Dragon Frontiers"
  "sun-moon": 1863, // "SM Base Set"
  "expedition-base-set": 1375, // "Expedition"
  "xy": 1387, // "XY Base Set"
  "evolutions": 1842, // "XY - Evolutions"
  "legendary-collection": 1374, // "Legendary Collection"
};

/**
 * Researched single-booster-pack market anchor (USD) for the few ultra-vintage
 * sets TCGCSV/TCGplayer quotes no sealed product for. Used ONLY as the base of a
 * flagged estimate (never shown as a real quote). Approximate eBay-sold values,
 * mid-2025; refresh as the vintage sealed market moves.
 */
const SEALED_PACK_ANCHOR_USD: Record<string, number> = {
  "neo-genesis": 350,
  "neo-destiny": 500,
  "aquapolis": 700,
  "skyridge": 1300,
  "ex-delta-species": 90,
};

/**
 * Cross-sourced TRUE single-booster-pack USD for vintage sets where TCGplayer's
 * "market" is a thin-ask outlier far above real sold prices (illiquid old sealed
 * trades off a handful of high listings). Values are the CONSERVATIVE low end of
 * PriceCharting loose + eBay-sold ranges, adversarially reviewed (only medium+
 * confidence and >25% over the live quote). This REPLACES the booster quote (flagged
 * estimated, so the UI shows "≈") and re-bases the derived box/ETB estimates.
 * Refresh as the vintage sealed market moves. See pokeev-sealed-prices.
 */
const SEALED_PACK_OVERRIDE_USD: Record<string, number> = {
  "legendary-collection": 2000, // was $6000 (PriceCharting/eBay $2000-3200)
  "expedition-base-set": 500, // was $4800 (~5× over true)
  "ex-deoxys": 1200, // was $2500
  "ex-legend-maker": 900, // was $2000
  "ex-team-magma-vs-team-aqua": 600, // was $1600
  "ex-crystal-guardians": 350, // was $1300 (thin-ask outlier)
  "neo-revelation": 300, // was $1000 (Unlimited; eBay-sold ~$380)
  "ex-power-keepers": 420, // was $915
  "ex-ruby-sapphire": 270, // was $800
  "base-set": 430, // was $745 (Revised/Unlimited pack)
  "plasma-storm": 120, // was $393 (BW-era; TCGplayer market badly inflated)
};

const ESTIMATE_NAME: Record<ProductKind, string> = {
  booster: "Booster pack (est.)",
  display: "Booster box (est.)",
  etb: "Elite Trainer Box (est.)",
};

interface OfferedProduct {
  kind: ProductKind;
  packs: number;
}

function offeredProducts(config: PullRateConfig | undefined): OfferedProduct[] {
  const out: OfferedProduct[] = [{ kind: "booster", packs: 1 }];
  if (config?.products.display) out.push({ kind: "display", packs: config.products.display.packs });
  if (config?.products.etb) out.push({ kind: "etb", packs: config.products.etb.packs });
  return out;
}

/**
 * Fills any offered product kind that has no real market quote with an estimate
 * scaled from the set's real per-pack price (or a researched anchor). Returns the
 * derived entries only — the caller appends them to the real ones.
 */
function deriveMissing(
  setId: string,
  real: SnapshotSealed[],
  config: PullRateConfig | undefined,
  eurPerUsd: number | null,
): SnapshotSealed[] {
  const realUsd = (kind: ProductKind): number | null => {
    const xs = real.filter((s) => s.kind === kind && s.usd != null).map((s) => s.usd!);
    return xs.length ? Math.min(...xs) : null;
  };

  // Per-pack USD anchor: prefer the loose single pack — it's the most liquid,
  // reliable unit. Fall back to the box bulk-rate, then the ETB rate, then a
  // researched anchor for sets with no quote at all. (Using the box rate first
  // would inflate ETB/box estimates on sets whose box is an illiquid outlier,
  // e.g. Ancient Origins.)
  let packRate: number | null = null;
  const displayPacks = config?.products.display?.packs;
  const etbPacks = config?.products.etb?.packs;
  if (realUsd("booster") != null) packRate = realUsd("booster")!;
  else if (displayPacks && realUsd("display") != null) packRate = realUsd("display")! / displayPacks;
  else if (etbPacks && realUsd("etb") != null) packRate = realUsd("etb")! / etbPacks;
  else if (SEALED_PACK_ANCHOR_USD[setId] != null) packRate = SEALED_PACK_ANCHOR_USD[setId];

  if (packRate == null) return [];

  const out: SnapshotSealed[] = [];
  for (const o of offeredProducts(config)) {
    if (realUsd(o.kind) != null) continue; // real quote exists → keep it
    const usd = round2(packRate * o.packs);
    const eur = eurPerUsd != null ? round2(usd * eurPerUsd) : null;
    out.push({ kind: o.kind, name: ESTIMATE_NAME[o.kind], eur, usd, image: null, estimated: true });
  }
  return out;
}

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
  /** Pull-rate configs — enable estimate-fill for product kinds with no quote. */
  pullRates?: Map<string, PullRateConfig>;
  /** Hard cap on provider HTTP calls (the provider enforces it too). */
  budget: number;
  log?: (message: string) => void;
}): Promise<SealedMergeResult> {
  const { snapshot, provider, catalogSets, pullRates, budget } = opts;
  const log = opts.log ?? (() => {});
  const byId = new Map(catalogSets.map((s) => [s.id, s]));
  const eurUsd = snapshot.fx?.eurUsd;
  const eurPerUsd = eurUsd && eurUsd > 0 ? 1 / eurUsd : null;

  const episodes = await provider.listSets(); // 1 call
  log(`sealed: ${episodes.length} episodes listed (1 call)`);

  const sets: Record<string, SnapshotSet> = { ...snapshot.sets };
  const matched: string[] = [];
  const unmatched: string[] = [];

  const ids = Object.keys(sets).sort((a, b) =>
    (byId.get(b)?.releaseDate ?? "").localeCompare(byId.get(a)?.releaseDate ?? ""),
  );

  for (const id of ids) {
    const set = byId.get(id);
    if (!set) continue;
    const config = pullRates?.get(id);

    const overrideGid = SEALED_GROUP_OVERRIDE[id];
    const externalId =
      overrideGid != null ? overrideGid : (matchEpisode(set, episodes)?.externalId ?? null);

    let real: SnapshotSealed[] = [];
    if (externalId == null) {
      unmatched.push(id);
      log(`sealed: ✗ no episode match for ${id}`);
    } else if (provider.callsUsed() + 1 > budget) {
      log(`sealed: budget reached, stopping (${provider.callsUsed()} calls)`);
      break;
    } else {
      try {
        real = (await provider.sealedProducts(externalId)).map((p) => ({
          kind: p.kind,
          name: p.name,
          eur: p.prices.eur,
          usd: p.prices.usd,
          image: p.image ?? null,
        }));
      } catch (e) {
        log(`sealed: ✗ ${id} failed: ${(e as Error).message}`);
        continue;
      }
    }

    // Cross-sourced booster override for vintage sets whose TCGplayer "market" is a
    // thin-ask outlier: replace the pack quote with the researched true value (flagged
    // estimated), and re-base the derived box/ETB on it. Applied to the live `real`
    // BEFORE deriveMissing so the box estimate tracks the corrected pack rate.
    const ovrUsd = SEALED_PACK_OVERRIDE_USD[id];
    if (ovrUsd != null) {
      const ovrEur = eurPerUsd != null ? round2(ovrUsd * eurPerUsd) : null;
      const hasBooster = real.some((p) => p.kind === "booster");
      real = real.map((p) =>
        p.kind === "booster" ? { ...p, usd: ovrUsd, eur: ovrEur, estimated: true } : p,
      );
      if (!hasBooster) {
        real.push({ kind: "booster", name: ESTIMATE_NAME.booster, eur: ovrEur, usd: ovrUsd, image: null, estimated: true });
      }
    }

    // When TCGCSV flakes for a set (transient empty fetch), keep its prior REAL
    // quotes and still derive missing estimates from them — otherwise a newly
    // offered product (e.g. a freshly added display) silently gets no estimate
    // on the days the fetch returns nothing.
    const priorReal = (sets[id]?.sealed ?? []).filter((p) => !p.estimated);
    const base = real.length > 0 ? real : priorReal;
    const derived = pullRates ? deriveMissing(id, base, config, eurPerUsd) : [];
    const combined = [...base, ...derived];
    if (combined.length > 0) {
      sets[id] = { ...sets[id], sealed: combined };
      if (externalId != null && real.length > 0) matched.push(id);
      log(
        `sealed: ✓ ${id} — ${base.length} real + ${derived.length} est${real.length === 0 ? " (prior)" : ""} (calls: ${provider.callsUsed()})`,
      );
    } else {
      log(`sealed: – ${id} — no priced products (calls: ${provider.callsUsed()})`);
    }
  }

  return { snapshot: { ...snapshot, sets }, matched, unmatched, callsUsed: provider.callsUsed() };
}
