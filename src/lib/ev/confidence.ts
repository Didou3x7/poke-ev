import type { ConfidenceInput, ConfidenceScore } from "./types";

/**
 * Composite confidence index shown next to every EV figure.
 *
 *  - pull rates  (weight 0.40): quality of the documented rates
 *  - prices      (weight 0.35): share of the set's cards carrying a price
 *  - freshness   (weight 0.25): age of the price snapshot (full marks ≤ 2 days,
 *                 linear decay, zero at 18+ days)
 */

const PULL_RATE_SCORES = { high: 100, medium: 70, low: 40 } as const;

export function computeConfidence(input: ConfidenceInput): ConfidenceScore {
  const pullRates = PULL_RATE_SCORES[input.pullRateConfidence];
  const prices = Math.max(0, Math.min(1, input.priceCompleteness)) * 100;
  const freshness = Math.max(0, Math.min(100, 100 - Math.max(0, input.snapshotAgeDays - 2) * 6.25));

  const score = Math.round(pullRates * 0.4 + prices * 0.35 + freshness * 0.25);
  const label = score >= 80 ? "high" : score >= 55 ? "medium" : "low";

  return { score, label, parts: { pullRates, prices, freshness } };
}
