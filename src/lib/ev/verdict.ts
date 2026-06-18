import type { Verdict, VerdictInput } from "./types";

/**
 * Verdict logic, as documented in the FAQ — one comparison:
 *
 * 1. OPEN when EV(open) beats the price paid.
 * 2. Otherwise KEEP (the opening EV doesn't cover what you paid; the displayed
 *    numbers tell the full story).
 *
 * The sealed market price is shown for information (resale value) but never
 * overrides the verdict: if the booster/ETB/display opens for more than you
 * paid, it says OPEN. Margins are always expressed against the price paid. The
 * profit probability is P(opened value > price paid) under a normal
 * approximation of the sum of `packs` i.i.d. pack values (CLT) — exact enough
 * for 9+ packs, labelled as an estimate in the UI for single boosters.
 */

/** Abramowitz & Stegun 7.1.26 — max abs error 1.5e-7, plenty for display. */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(x: number, mean: number, stdDev: number): number {
  if (stdDev <= 0) return x >= mean ? 1 : 0;
  return 0.5 * (1 + erf((x - mean) / (stdDev * Math.SQRT2)));
}

export function profitProbability(
  pricePaid: number,
  packs: number,
  packEv: number,
  packStdDev: number,
): number {
  const mean = packs * packEv;
  const stdDev = packStdDev * Math.sqrt(packs);
  return 1 - normalCdf(pricePaid, mean, stdDev);
}

export function computeVerdict(input: VerdictInput): Verdict {
  const { pricePaid, packs, packEv, packStdDev, sealedMarketPrice, sealedEstimated } = input;
  const openEv = packs * packEv;
  const marginAbs = openEv - pricePaid;
  const marginPct = pricePaid > 0 ? marginAbs / pricePaid : 0;

  let kind: Verdict["kind"];
  if (packEv <= 0) {
    kind = "unavailable";
  } else if (openEv > pricePaid) {
    kind = "open";
  } else {
    kind = "keep";
  }

  return {
    kind,
    openEv,
    marginAbs,
    marginPct,
    profitProbability: packEv > 0 ? profitProbability(pricePaid, packs, packEv, packStdDev) : 0,
    sealedMarketPrice,
    sealedPremium: sealedMarketPrice != null ? sealedMarketPrice - openEv : null,
    sealedEstimated: sealedEstimated ?? false,
  };
}
