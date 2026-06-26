// Auto-estimate a newly-onboarded set's pull-rates so its EV appears immediately (owner: full
// auto onboarding). The estimate CLONES the structure of the newest STANDARD same-generation set
// (a real, high-confidence booster with a display box) and is flagged `confidence: "low"` — the
// site already surfaces confidence, so the EV reads as an approximation until a sourced pull-rate
// file replaces it. It never overwrites a hand-sourced file. Self-improving: the reference is
// always the latest real same-era set, so estimates track the current booster design.
import type { PullRateConfigInput } from "./schemas";

const rank = (c: PullRateConfigInput["confidence"]): number => (c === "high" ? 2 : c === "medium" ? 1 : 0);

export function deriveEstimatedPullRate(opts: {
  newSetId: string;
  era: string;
  /** All existing, valid pull-rate configs. */
  existing: PullRateConfigInput[];
  /** Catalog release date (YYYY-MM-DD) per set id — picks the most recent reference. */
  releaseDateById: Map<string, string>;
}): PullRateConfigInput | null {
  const sameEra = opts.existing.filter((r) => r.era === opts.era);
  const pick = (pool: PullRateConfigInput[]): PullRateConfigInput | undefined =>
    [...pool].sort((a, b) => {
      const c = rank(b.confidence) - rank(a.confidence);
      if (c) return c;
      return (opts.releaseDateById.get(b.setId) ?? "").localeCompare(opts.releaseDateById.get(a.setId) ?? "");
    })[0];

  // Prefer a STANDARD booster (has a display box) so the estimate isn't skewed by a special set
  // with no Western display (e.g. 151, Paldean Fates). Fall back to any same-era set.
  const ref = pick(sameEra.filter((r) => r.products.display != null)) ?? pick(sameEra);
  if (!ref) return null;

  return {
    setId: opts.newSetId,
    era: opts.era,
    confidence: "low",
    sources: ref.sources,
    notes: `Auto-estimated from "${ref.setId}" (typical ${opts.era} booster structure). EV is approximate — low confidence — until a sourced pull-rate file replaces this.`,
    packSize: ref.packSize,
    slots: ref.slots,
    products: ref.products,
  };
}
