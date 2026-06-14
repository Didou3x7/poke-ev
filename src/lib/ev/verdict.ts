import type { Verdict, VerdictInput } from "./types";

/**
 * Verdict logic, as documented in the FAQ:
 *
 * 1. When the real sealed market price is known and ≥ EV(open), the product is
 *    worth more closed: KEEP wins regardless of what was paid (opening would
 *    destroy value — sunk cost doesn't change that).
 * 2. Otherwise OPEN when EV(open) beats the price paid.
 * 3. Otherwise KEEP (negative expected margin; the displayed numbers tell the
 *    full story).
 *
 * Margins are always expressed against the price paid. The profit probability
 * is P(opened value > price paid) under a normal approximation of the sum of
 * `packs` i.i.d. pack values (CLT) — exact enough for 9+ packs, labelled as an
 * estimate in the UI for single boosters.
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
  const { pricePaid, packs, packEv, packStdDev, sealedMarketPrice } = input;
  const openEv = packs * packEv;
  const marginAbs = openEv - pricePaid;
  const marginPct = pricePaid > 0 ? marginAbs / pricePaid : 0;

  let kind: Verdict["kind"];
  if (packEv <= 0) {
    kind = "unavailable";
  } else if (sealedMarketPrice != null && sealedMarketPrice >= openEv) {
    kind = "keep";
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
  };
}
