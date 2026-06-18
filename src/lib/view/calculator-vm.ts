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
  /** True when sealedPrice is a derived estimate (no live market quote). */
  sealedEstimated: boolean;
}

export interface CalcTopCard {
  name: string;
  number: string | null;
  value: number;
  probabilityPerPack: number;
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

/**
 * Light payload shipped on every calculator-bearing page (incl. the LCP-critical
 * home page): set options + meta, but NOT the heavy per-set EV data. The client
 * fetches a set's `CalcSetData` on demand from `/api/calc/[locale]/[set]` when
 * the user picks it — keeping the initial HTML/JS small.
 */
export interface CalculatorShell {
  locale: Locale;
  generatedAt: string;
  demo: boolean;
  fx: { eurUsd: number; asOf: string } | null;
  snapshotAgeDays: number;
  sets: CalcSetOption[];
  /** How many sets have EV — lets the page detect an empty/degraded snapshot. */
  evCount: number;
}

/** Full payload (shell + every set's EV) — kept for non-lazy callers/tests. */
export interface CalculatorPayload extends Omit<CalculatorShell, "evCount"> {
  evData: Record<string, CalcSetData>;
}

function setOptions(snapshot: Awaited<ReturnType<typeof getSnapshot>>, pullRates: ReturnType<typeof getPullRates>): CalcSetOption[] {
  return getAllSets()
    .map((s) => ({
      id: s.id,
      nameFr: s.nameFr,
      nameEn: s.nameEn,
      releaseDate: s.releaseDate,
      era: getEraOfSet(s.id)?.era ?? "",
      evAvailable: Boolean(snapshot.sets[s.id]?.ev) && pullRates.has(s.id),
    }))
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
}

/** Build one set's calculator data. Returns null when the set has no EV. */
function buildSetData(
  snapshot: Awaited<ReturnType<typeof getSnapshot>>,
  pullRates: ReturnType<typeof getPullRates>,
  ageDays: number,
  setId: string,
  locale: Locale,
): CalcSetData | null {
  const snap = snapshot.sets[setId];
  const config = pullRates.get(setId);
  if (!snap?.ev || !config) return null;
  const ev = snap.ev[locale];
  const priceKey = locale === "fr" ? "eur" : "usd";

  const cardById = new Map(snap.cards.map((c) => [c.id, c]));
  const sealedOf = (kind: ProductKind): { sealedPrice: number | null; sealedEstimated: boolean } => {
    const quoted = snap.sealed.filter((p) => p.kind === kind && p[priceKey] != null);
    if (quoted.length === 0) return { sealedPrice: null, sealedEstimated: false };
    const real = quoted.filter((p) => !p.estimated);
    const pool = real.length > 0 ? real : quoted;
    return { sealedPrice: Math.min(...pool.map((p) => p[priceKey]!)), sealedEstimated: real.length === 0 };
  };

  const products: CalcProduct[] = [{ kind: "booster", packs: 1, ...sealedOf("booster") }];
  if (config.products.display) {
    products.push({ kind: "display", packs: config.products.display.packs, ...sealedOf("display") });
  }
  if (config.products.etb) {
    products.push({ kind: "etb", packs: config.products.etb.packs, ...sealedOf("etb") });
  }

  return {
    id: setId,
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
        { name: localizedCardName(card, locale), number: card.number, value: tc.value, probabilityPerPack: tc.probabilityPerPack },
      ];
    }),
    chaseCard: pickChaseCard(snap, locale),
    rarityBreakdown: ev.rarityBreakdown,
    updatedAt: snap.updatedAt,
  };
}

/** Light shell — no per-set EV data (that loads on demand). */
export async function buildCalculatorShell(locale: Locale): Promise<CalculatorShell> {
  const snapshot = await getSnapshot();
  const pullRates = getPullRates();
  const sets = setOptions(snapshot, pullRates);
  return {
    locale,
    generatedAt: snapshot.generatedAt,
    demo: snapshot.demo,
    fx: snapshot.fx,
    snapshotAgeDays: Math.max(0, snapshotAgeDays(snapshot)),
    sets,
    evCount: sets.filter((s) => s.evAvailable).length,
  };
}

/** One set's EV data — served by the `/api/calc` route, fetched lazily client-side. */
export async function getCalcSetData(locale: Locale, setId: string): Promise<CalcSetData | null> {
  const snapshot = await getSnapshot();
  const pullRates = getPullRates();
  return buildSetData(snapshot, pullRates, Math.max(0, snapshotAgeDays(snapshot)), setId, locale);
}

/** Full payload (all sets) — retained for tests / any non-lazy use. */
export async function buildCalculatorPayload(locale: Locale): Promise<CalculatorPayload> {
  const snapshot = await getSnapshot();
  const pullRates = getPullRates();
  const ageDays = Math.max(0, snapshotAgeDays(snapshot));
  const sets = setOptions(snapshot, pullRates);
  const evData: Record<string, CalcSetData> = {};
  for (const s of sets) {
    if (!s.evAvailable) continue;
    const d = buildSetData(snapshot, pullRates, ageDays, s.id, locale);
    if (d) evData[s.id] = d;
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
