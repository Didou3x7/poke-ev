import { computeVerdict } from "@/lib/ev/verdict";
import type { ProductKind, VerdictKind } from "@/lib/ev/types";
import { getAllSets, getEraOfSet, getPullRatesForSet } from "@/lib/data/catalog";
import { getSnapshot } from "@/lib/data/snapshot";
import type { Locale } from "@/lib/i18n/config";

/** Compact, serializable set card used by the landing ticker + featured grid. */
export interface FeaturedSet {
  id: string;
  name: string;
  eraName: string;
  releaseYear: string;
  packEv: number;
  /** EV of the headline product (display when it exists, else pack). */
  headlineKind: ProductKind;
  headlineEv: number;
  sealedPrice: number | null;
  verdict: VerdictKind | null;
  marginPct: number | null;
  priceCompleteness: number;
}

export async function buildFeaturedSets(locale: Locale, count = 8): Promise<FeaturedSet[]> {
  const snapshot = await getSnapshot();
  const priceKey = locale === "fr" ? ("eur" as const) : ("usd" as const);

  const featured: FeaturedSet[] = [];
  for (const set of getAllSets()) {
    const snap = snapshot.sets[set.id];
    const config = getPullRatesForSet(set.id);
    if (!snap?.ev || !config) continue;
    const ev = snap.ev[locale];
    if (ev.packEv <= 0) continue;

    const era = getEraOfSet(set.id);
    const hasDisplay = Boolean(config.products.display);
    const headlineKind: ProductKind = hasDisplay ? "display" : "booster";
    const packs = hasDisplay ? config.products.display!.packs : 1;
    const headlineEv = ev.packEv * packs;

    // Real quotes only — the landing's open/keep badge must not ride on a
    // derived estimate.
    const sealedQuotes = snap.sealed.filter(
      (p) => p.kind === headlineKind && p[priceKey] != null && !p.estimated,
    );
    const sealedPrice = sealedQuotes.length
      ? Math.min(...sealedQuotes.map((p) => p[priceKey]!))
      : null;

    const verdict =
      sealedPrice != null
        ? computeVerdict({
            pricePaid: sealedPrice,
            kind: headlineKind,
            packs,
            packEv: ev.packEv,
            packStdDev: ev.packStdDev,
            sealedMarketPrice: sealedPrice,
          })
        : null;

    featured.push({
      id: set.id,
      name: locale === "fr" ? set.nameFr : set.nameEn,
      eraName: era ? (locale === "fr" ? era.eraNameFr : era.eraNameEn) : "",
      releaseYear: set.releaseDate.slice(0, 4),
      packEv: ev.packEv,
      headlineKind,
      headlineEv,
      sealedPrice,
      verdict: verdict?.kind ?? null,
      marginPct: verdict?.marginPct ?? null,
      priceCompleteness: ev.priceCompleteness,
    });
  }

  return featured.sort((a, b) => b.packEv - a.packEv).slice(0, count);
}
