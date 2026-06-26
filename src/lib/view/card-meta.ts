import type { Metadata } from "next";
import { getAllSets, getSetById } from "@/lib/data/catalog";
import { getSnapshot } from "@/lib/data/snapshot";
import {
  localizeCardImage,
  localizedCardName,
  type SnapshotCard,
} from "@/lib/data/snapshot-types";
import { formatMoney, localePath, type Locale } from "@/lib/i18n/config";
import { rarityLabel } from "@/lib/i18n/rarities";
import { withSeoQuery } from "@/lib/ops/seo-targets";
import { pageMetadata } from "./seo";

/**
 * Long-tail "card price" pages — one per collectible (rare+) card, at
 * `/cartes/<card>-<set>` ↔ `/en/cards/<card>-<set>`, targeting "<card> <set>
 * price" searches (the highest-volume query class for a TCG price site).
 *
 * Scale strategy: there are ~8.5k eligible cards. We PRE-RENDER the top
 * `STATIC_PER_SET` of each set (fast first paint + the sitemap's priority URLs)
 * and serve the rest via ISR on demand (`dynamicParams`), so the deploy build
 * stays small while every card still has a cached, indexable page. The slug is
 * locale-neutral (built from the English name) so FR/EN are true hreflang pairs.
 *
 * Ranking is LOCALE-AWARE: "most valuable card in {set}" must hold in the market
 * the page is priced in — Cardmarket EUR on FR, TCGplayer USD on EN — and those
 * orderings genuinely differ (Skyridge's €-chase is Celebi, its $-chase Golem).
 * The slug set/eligibility stays locale-neutral (the union, ranked by whichever
 * market values a card highest) so both languages share one canonical URL; only
 * the displayed rank/related order is recomputed per locale. This mirrors
 * pickChaseCard's primary pass, so the set-page chase and its card page agree.
 */

const STATIC_PER_SET = 6; // pre-rendered at build time
const SITEMAP_PER_SET = 24; // listed in the sitemap (ISR-generated on first crawl)

const isLowRarity = (c: SnapshotCard) => c.rarity === "common" || c.rarity === "uncommon";
const maxPrice = (c: SnapshotCard) => Math.max(c.usd ?? 0, c.eur ?? 0);

/** A card earns a price page when it's collectible (NOT a plain common/uncommon,
 *  whose low-liquidity listings throw up artifacts — but special null-rarity
 *  inserts like Celebrations' Classic Collection DO qualify), has an image, and
 *  carries a real quote in at least one market. Mirrors pickChaseCard. */
const isEligible = (c: SnapshotCard) =>
  !isLowRarity(c) && c.image != null && ((c.usd ?? 0) > 0 || (c.eur ?? 0) > 0);

function kebab(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface RankedCard {
  card: SnapshotCard;
  slug: string;
}

interface CardIndex {
  key: string;
  bySet: Map<string, RankedCard[]>; // ranked desc by USD value
  slugToCard: Map<string, { setId: string; cardId: string }>;
}

let _index: CardIndex | null = null;

/** Build (and memoize, keyed by snapshot freshness) the full card-page index. */
async function cardIndex(): Promise<CardIndex> {
  const snapshot = await getSnapshot();
  if (_index && _index.key === snapshot.generatedAt) return _index;
  const bySet = new Map<string, RankedCard[]>();
  const slugToCard = new Map<string, { setId: string; cardId: string }>();
  for (const set of getAllSets()) {
    const snap = snapshot.sets[set.id];
    if (!snap) continue;
    // Locale-neutral canonical order: ranked by whichever market prices a card
    // highest, so the bare slug + pre-render/sitemap slots go to the true chase
    // in EITHER currency. Per-locale rank is recomputed in getCardPage.
    const eligible = snap.cards
      .filter(isEligible)
      .sort((a, b) => maxPrice(b) - maxPrice(a) || (a.id < b.id ? -1 : 1));
    const ranked: RankedCard[] = [];
    const used = new Set<string>();
    for (const c of eligible) {
      let slug = `${kebab(c.name)}-${set.id}`;
      if (used.has(slug)) slug = `${kebab(c.name)}-${kebab(c.number ?? "")}-${set.id}`;
      if (used.has(slug)) slug = `${kebab(c.name)}-${kebab(c.id)}`;
      used.add(slug);
      slugToCard.set(slug, { setId: set.id, cardId: c.id });
      ranked.push({ card: c, slug });
    }
    if (ranked.length) bySet.set(set.id, ranked);
  }
  _index = { key: snapshot.generatedAt, bySet, slugToCard };
  return _index;
}

export interface RelatedCard {
  slug: string;
  name: string;
  number: string | null;
  priceFormatted: string | null;
  image: string;
  imageEn: string;
}

export interface CardPageData {
  slug: string;
  setId: string;
  setName: string;
  cardName: string;
  number: string | null;
  rarity: string | null;
  price: number | null;
  priceFormatted: string | null;
  image: string;
  imageEn: string;
  packEv: number | null;
  releaseDate: string;
  rank: number;
  totalRanked: number;
  evSharePct: number | null;
  related: RelatedCard[];
  rarityPeers: RelatedCard[];
}

/** Re-rank a set's eligible cards in one locale's market (priced-in-locale
 *  first, desc; the other market only breaks ties). Rank #1 = locale-priciest. */
function rankedForLocale(ranked: RankedCard[], locale: Locale): RankedCard[] {
  const priceKey = locale === "fr" ? "eur" : "usd";
  const otherKey = locale === "fr" ? "usd" : "eur";
  return [...ranked].sort(
    (a, b) =>
      (b.card[priceKey] ?? 0) - (a.card[priceKey] ?? 0) ||
      (b.card[otherKey] ?? 0) - (a.card[otherKey] ?? 0) ||
      (a.card.id < b.card.id ? -1 : 1),
  );
}

function toRelated(r: RankedCard, locale: Locale, priceKey: "eur" | "usd"): RelatedCard {
  return {
    slug: r.slug,
    name: localizedCardName(r.card, locale),
    number: r.card.number,
    priceFormatted: r.card[priceKey] != null ? formatMoney(r.card[priceKey]!, locale) : null,
    image: localizeCardImage(r.card.image!, locale),
    imageEn: r.card.image!,
  };
}

/** Top sibling cards by locale price (the set's other big hits). */
function relatedOf(ranked: RankedCard[], selfSlug: string, locale: Locale): RelatedCard[] {
  const priceKey = locale === "fr" ? "eur" : "usd";
  return ranked
    .filter((r) => r.slug !== selfSlug)
    .slice(0, 6)
    .map((r) => toRelated(r, locale, priceKey));
}

/** Cards sharing this card's rarity tier (e.g. other holo-rares), ranked by
 *  locale price and excluding what "related" already surfaces — extra internal
 *  links that spread crawl budget to long-tail pages. */
function rarityPeersOf(
  ranked: RankedCard[],
  selfSlug: string,
  rarity: string | null,
  exclude: Set<string>,
  locale: Locale,
): RelatedCard[] {
  if (!rarity) return [];
  const priceKey = locale === "fr" ? "eur" : "usd";
  return ranked
    .filter((r) => r.slug !== selfSlug && r.card.rarity === rarity && !exclude.has(r.slug))
    .slice(0, 6)
    .map((r) => toRelated(r, locale, priceKey));
}

export async function getCardPage(slug: string, locale: Locale): Promise<CardPageData | null> {
  const idx = await cardIndex();
  const entry = idx.slugToCard.get(slug);
  if (!entry) return null;
  const catalog = getSetById(entry.setId);
  const snapshot = await getSnapshot();
  const snap = snapshot.sets[entry.setId];
  if (!catalog || !snap) return null;
  // Rank within THIS locale's market — "most valuable" must hold in the currency
  // the page is priced in (FR=EUR, EN=USD); the two orderings differ for ~46 sets.
  const ranked = rankedForLocale(idx.bySet.get(entry.setId) ?? [], locale);
  const rankIdx = ranked.findIndex((r) => r.card.id === entry.cardId);
  if (rankIdx < 0) return null; // card dropped from the ranked set → no valid rank
  const card = ranked[rankIdx]?.card;
  if (!card || card.image == null) return null;
  const priceKey = locale === "fr" ? "eur" : "usd";
  const price = card[priceKey] ?? null;

  // EV share: this card's contribution to the booster EV, when it's a top card.
  let evSharePct: number | null = null;
  const ev = snap.ev ? snap.ev[locale] : null;
  if (ev && ev.packEv > 0) {
    const tc = ev.topCards.find((t) => t.cardId === card.id);
    if (tc) evSharePct = Math.round((tc.evContribution / ev.packEv) * 1000) / 10;
  }

  const related = relatedOf(ranked, slug, locale);

  return {
    slug,
    setId: entry.setId,
    setName: locale === "fr" ? catalog.nameFr : catalog.nameEn,
    cardName: localizedCardName(card, locale),
    number: card.number,
    rarity: card.rarity ? rarityLabel(card.rarity, locale) : null,
    price,
    priceFormatted: price != null ? formatMoney(price, locale) : null,
    image: localizeCardImage(card.image, locale),
    imageEn: card.image,
    packEv: ev ? ev.packEv : null,
    releaseDate: catalog.releaseDate,
    rank: rankIdx + 1,
    totalRanked: ranked.length,
    evSharePct,
    related,
    rarityPeers: rarityPeersOf(ranked, slug, card.rarity, new Set(related.map((r) => r.slug)), locale),
  };
}

/** cardId → card-page slug for one set, so set/calculator pages can deep-link
 *  each card to its price page (internal linking spreads crawl + link equity). */
export async function cardSlugMap(setId: string): Promise<Map<string, string>> {
  const idx = await cardIndex();
  const m = new Map<string, string>();
  for (const r of idx.bySet.get(setId) ?? []) m.set(r.card.id, r.slug);
  return m;
}

/** Top `STATIC_PER_SET` card slugs per set — pre-rendered at build time. */
export async function cardStaticParams(): Promise<{ slug: string }[]> {
  const idx = await cardIndex();
  const out: { slug: string }[] = [];
  for (const ranked of idx.bySet.values()) {
    for (const r of ranked.slice(0, STATIC_PER_SET)) out.push({ slug: r.slug });
  }
  return out;
}

/** Card slugs for the sitemap (top `SITEMAP_PER_SET` per set). */
export async function cardSitemapSlugs(): Promise<string[]> {
  const idx = await cardIndex();
  const out: string[] = [];
  for (const ranked of idx.bySet.values()) {
    for (const r of ranked.slice(0, SITEMAP_PER_SET)) out.push(r.slug);
  }
  return out;
}

export async function cardPageMetadata(locale: Locale, slug: string): Promise<Metadata> {
  const data = await getCardPage(slug, locale);
  // Unknown slug → the page 404s. Give it a real title and keep it out of the
  // index (no canonical/og pointing at a dead URL) rather than a blank preview.
  if (!data) {
    return {
      title: locale === "fr" ? "Carte introuvable | Poké EV" : "Card not found | Poké EV",
      robots: { index: false, follow: false },
    };
  }
  const meta = pageMetadata(locale, "card", {
    slug,
    vars: {
      card: data.cardName,
      set: data.setName,
      price: data.priceFormatted ?? (locale === "fr" ? "à venir" : "TBD"),
    },
  });
  return withSeoQuery(meta, localePath(locale, "card", slug), locale);
}
