/**
 * Per-card EUR/USD reconciliation for the snapshot build. Pure + side-effect free
 * so it can be unit-tested in isolation (no network, no fs). Three ordered steps:
 *
 *   1. Fill a missing market from the other at the day's FX rate.
 *   2. Stale-EUR guard — pokemontcg.io's Cardmarket (EUR) feed can freeze for
 *      months on some cards while TCGplayer (USD) stays fresh (observed: SWSH
 *      Galarian Gallery EUR frozen since Jan 2026, USD refreshing daily). A
 *      stale-low EUR silently understates FR prices + EV, so when BOTH sides are
 *      real quotes, the EUR quote is old AND materially below the fresh USD, the
 *      EUR is re-derived from USD. Genuine EU/US market gaps are left untouched.
 *   3. Symmetric divergence clamp — a wild EUR/USD gap (a Cardmarket/TCGplayer
 *      data artifact, e.g. €140 vs $0.44) is clamped to the other side.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY_MS = 86_400_000;

/** A Cardmarket EUR quote older than this (days) is treated as potentially stale. */
export const STALE_EUR_DAYS = 45;
/** Only re-derive a stale EUR when it sits below this fraction of the USD-implied
 *  value (0.8 ⇒ more than 20% under) — narrow EU/US differences are preserved. */
export const STALE_EUR_MAX_RATIO = 0.8;

export function isEurStale(asOf: string | null | undefined, nowMs: number): boolean {
  if (!asOf) return false;
  const t = Date.parse(asOf);
  if (Number.isNaN(t)) return false;
  return nowMs - t > STALE_EUR_DAYS * DAY_MS;
}

export interface ReconcileOpts {
  /** EUR→USD rate for the build day. */
  eurUsd: number;
  /** common/uncommon clamp tighter (3.5×) than hits (6×). */
  lowRarity: boolean;
  /** updatedAt of the Cardmarket (EUR) quote, for staleness detection. */
  eurAsOf?: string | null;
  /** Build-time epoch ms, compared against eurAsOf. */
  nowMs: number;
}

export function reconcileCardPrices(
  rawEur: number | null,
  rawUsd: number | null,
  opts: ReconcileOpts,
): { eur: number | null; usd: number | null } {
  const { eurUsd, lowRarity, eurAsOf, nowMs } = opts;
  // (1) fill a missing market from the other side.
  let eur = rawEur ?? (rawUsd != null ? round2(rawUsd / eurUsd) : null);
  let usd = rawUsd ?? (rawEur != null ? round2(rawEur * eurUsd) : null);
  if (eur != null && usd != null && eur > 0 && usd > 0) {
    // (2) stale-EUR guard — only when both are genuine quotes (never FX-derived),
    // the EUR is old, and it's materially below the fresh USD.
    if (rawEur != null && rawUsd != null && isEurStale(eurAsOf, nowMs)) {
      if ((eur * eurUsd) / usd < STALE_EUR_MAX_RATIO) eur = round2(usd / eurUsd);
    }
    // (3) symmetric divergence clamp. Genuine grails diverge up to ~5× by
    // condition/market (bar 6×); low-rarity cards should track closely (3.5×).
    const thr = lowRarity ? 3.5 : 6;
    const ratio = (eur * eurUsd) / usd;
    if (ratio > thr) eur = round2(usd / eurUsd);
    else if (ratio < 1 / thr) usd = round2(eur * eurUsd);
  }
  return { eur, usd };
}
