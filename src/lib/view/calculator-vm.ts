import { computeConfidence } from "@/lib/ev/confidence";
import type { ConfidenceScore, ProductKind } from "@/lib/ev/types";
import type { RarityBreakdown } from "@/lib/ev/types";
import { getAllSets, getEraOfSet, getPullRates } from "@/lib/data/catalog";
import { getSnapshot } from "@/lib/data/snapshot";
import { localizedCardName, pickChaseCard, snapshotAgeDays, type ChaseCard } from "@/lib/data/snapshot-types";
import type { Locale } from "@/lib/i18n/config";

/** Serializable payload feeding the client calculator. No card lists, no API. */

export interface CalcSetOption {
  id: string;
  nameFr: string;
  nameEn: string;
  releaseDate: string;
  era: string;
  evAvailable: boolean;
}

export interface CalcProduct {
  kind: ProductKind;
  packs: number;
  /** Sealed market price in the locale's currency, when quoted. */
  sealedPrice: number | null;
}

export interface CalcTopCard {
  name: string;
  number: string | null;
  image: string | null;
  value: number;
  probabilityPerPack: number;
  evContribution: number;
}

export interface CalcSetData {
  id: string;
  packEv: number;
  packStdDev: number;
  priceCompleteness: number;
  confidence: ConfidenceScore;
  products: CalcProduct[];
  topCards: CalcTopCard[];
  /** The set's most valuable card, shown as a holographic showcase. */
  chaseCard: ChaseCard | null;
  rarityBreakdown: RarityBreakdown[];
  updatedAt: string;
}

export interface CalculatorPayload {
  locale: Locale;
  generatedAt: string;
  demo: boolean;
  fx: { eurUsd: number; asOf: string } | null;
  snapshotAgeDays: number;
  sets: CalcSetOption[];
  evData: Record<string, CalcSetData>;
}

export async function buildCalculatorPayload(locale: Locale): Promise<CalculatorPayload> {
  const snapshot = await getSnapshot();
  const pullRates = getPullRates();
  const ageDays = Math.max(0, snapshotAgeDays(snapshot));

  const sets: CalcSetOption[] = getAllSets()
    .map((s) => ({
      id: s.id,
      nameFr: s.nameFr,
      nameEn: s.nameEn,
      releaseDate: s.releaseDate,
      era: getEraOfSet(s.id)?.era ?? "",
      evAvailable: Boolean(snapshot.sets[s.id]?.ev) && pullRates.has(s.id),
    }))
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));

  const evData: Record<string, CalcSetData> = {};
  for (const set of sets) {
    if (!set.evAvailable) continue;
    const snap = snapshot.sets[set.id]!;
    const config = pullRates.get(set.id)!;
    const ev = snap.ev![locale];
    const priceKey = locale === "fr" ? "eur" : "usd";

    const cardById = new Map(snap.cards.map((c) => [c.id, c]));
    const sealedOf = (kind: ProductKind): number | null => {
      const quoted = snap.sealed.filter((p) => p.kind === kind && p[priceKey] != null);
      if (quoted.length === 0) return null;
      // Several quoted variants → take the cheapest (entry price of the product).
      return Math.min(...quoted.map((p) => p[priceKey]!));
    };

    const products: CalcProduct[] = [{ kind: "booster", packs: 1, sealedPrice: sealedOf("booster") }];
    if (config.products.display) {
      products.push({ kind: "display", packs: config.products.display.packs, sealedPrice: sealedOf("display") });
    }
    if (config.products.etb) {
      products.push({ kind: "etb", packs: config.products.etb.packs, sealedPrice: sealedOf("etb") });
    }

    evData[set.id] = {
      id: set.id,
      packEv: ev.packEv,
      packStdDev: ev.packStdDev,
      priceCompleteness: ev.priceCompleteness,
      confidence: computeConfidence({
        pullRateConfidence: snap.pullRateConfidence ?? "low",
        priceCompleteness: ev.priceCompleteness,
        snapshotAgeDays: ageDays,
      }),
      products,
      topCards: ev.topCards.flatMap((tc) => {
        const card = cardById.get(tc.cardId);
        if (!card) return [];
        return [
          {
            name: localizedCardName(card, locale),
            number: card.number,
            image: card.image,
            value: tc.value,
            probabilityPerPack: tc.probabilityPerPack,
            evContribution: tc.evContribution,
          },
        ];
      }),
      chaseCard: pickChaseCard(snap, locale),
      rarityBreakdown: ev.rarityBreakdown,
      updatedAt: snap.updatedAt,
    };
  }

  return {
    locale,
    generatedAt: snapshot.generatedAt,
    demo: snapshot.demo,
    fx: snapshot.fx,
    snapshotAgeDays: ageDays,
    sets,
    evData,
  };
}
