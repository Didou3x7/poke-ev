import type { ProductKind, PullRateConfidence, RarityBreakdown } from "../ev/types";
import type { RarityId } from "../ev/rarity";

/**
 * Shape of the precomputed price/EV snapshot. The front end NEVER talks to the
 * price API: it reads this snapshot (Vercel Blob in production, bundled JSON
 * fallback), regenerated at most ~once a day by the cron job.
 */

export interface SnapshotCard {
  id: string;
  /** English name (canonical). */
  name: string;
  /** French name when known — shown on the FR site; falls back to `name`. */
  nameFr: string | null;
  number: string | null;
  rarity: RarityId | null;
  rawRarity: string | null;
  eur: number | null;
  usd: number | null;
  image: string | null;
}

/** Picks the right card name for a locale. */
export function localizedCardName(card: { name: string; nameFr: string | null }, locale: "fr" | "en"): string {
  return locale === "fr" ? (card.nameFr ?? card.name) : card.name;
}

/** The set's single most valuable card — its "chase". Localized name + image. */
export interface ChaseCard {
  name: string;
  number: string | null;
  /** Localized high-res CDN url (FR print on the FR site). */
  image: string;
  /** Canonical EN url — used as an onError fallback when the FR print is absent. */
  imageEn: string;
  /** Market value in the locale's currency (EUR on FR, USD on EN). */
  value: number;
}

/** Snapshot stores the EN CDN url (…/en/…). Swap the locale segment so the FR
 *  site shows the French print; callers fall back to the EN url via onError. */
function localizeCardImage(url: string, locale: "fr" | "en"): string {
  return locale === "en" ? url : url.replace("/assets.tcgdex.net/en/", `/assets.tcgdex.net/${locale}/`);
}

/** The most expensive single card of a set (by the locale's market price). */
export function pickChaseCard(set: { cards: SnapshotCard[] }, locale: "fr" | "en"): ChaseCard | null {
  const key = locale === "fr" ? "eur" : "usd";
  let best: SnapshotCard | null = null;
  for (const c of set.cards) {
    if (c[key] == null || !c.image) continue;
    if (!best || c[key]! > best[key as "eur" | "usd"]!) best = c;
  }
  if (!best || best.image == null) return null;
  return {
    name: localizedCardName(best, locale),
    number: best.number,
    image: localizeCardImage(best.image, locale),
    imageEn: best.image,
    value: best[key]!,
  };
}

export interface SnapshotTopCard {
  cardId: string;
  probabilityPerPack: number;
  value: number;
  evContribution: number;
}

export interface SnapshotSetEv {
  packEv: number;
  packStdDev: number;
  priceCompleteness: number;
  unknownRarityCards: number;
  rarityBreakdown: RarityBreakdown[];
  topCards: SnapshotTopCard[];
}

export interface SnapshotSealed {
  kind: ProductKind;
  name: string;
  eur: number | null;
  usd: number | null;
  image: string | null;
}

export interface SnapshotSet {
  setId: string;
  episodeId: number | string | null;
  logo: string | null;
  symbol: string | null;
  /** Per-market EV — null when the set has no pull-rate file (EV indisponible). */
  ev: { fr: SnapshotSetEv; en: SnapshotSetEv } | null;
  pullRateConfidence: PullRateConfidence | null;
  sealed: SnapshotSealed[];
  cards: SnapshotCard[];
  updatedAt: string;
}

export interface Snapshot {
  version: 1;
  generatedAt: string;
  /** True when the data is synthetic demo data — surfaced loudly in the UI. */
  demo: boolean;
  /** EUR→USD rate used by the converter, with its date. */
  fx: { eurUsd: number; asOf: string } | null;
  /** Keyed by catalog set id. */
  sets: Record<string, SnapshotSet>;
  /** Cursor for spreading API refreshes across daily budget windows. */
  cursor: number;
}

export const EMPTY_SNAPSHOT: Snapshot = {
  version: 1,
  generatedAt: "1970-01-01T00:00:00.000Z",
  demo: false,
  fx: null,
  sets: {},
  cursor: 0,
};

export function snapshotAgeDays(snapshot: Snapshot, now = Date.now()): number {
  return (now - Date.parse(snapshot.generatedAt)) / 86_400_000;
}
