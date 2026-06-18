import type { Metadata } from "next";
import { getAllSets, getSetById } from "@/lib/data/catalog";
import { getSnapshot } from "@/lib/data/snapshot";
import {
  localizeCardImage,
  localizedCardName,
  type SnapshotCard,
  type SnapshotSet,
} from "@/lib/data/snapshot-types";
import { formatMoney, type Locale } from "@/lib/i18n/config";
import { rarityLabel } from "@/lib/i18n/rarities";
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
 */

const STATIC_PER_SET = 6; // pre-rendered at build time
const SITEMAP_PER_SET = 24; // listed in the sitemap (ISR-generated on first crawl)

const isLowRarity = (c: SnapshotCard) => c.rarity === "common" || c.rarity === "uncommon";

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
    const eligible = snap.cards
      .filter((c) => c.rarity && !isLowRarity(c) && c.image != null && (c.usd ?? 0) > 0)
      .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
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
}

function relatedOf(ranked: RankedCard[], selfSlug: string, snap: SnapshotSet, locale: Locale): RelatedCard[] {
  const priceKey = locale === "fr" ? "eur" : "usd";
  return ranked
    .filter((r) => r.slug !== selfSlug)
    .slice(0, 6)
    .map((r) => ({
      slug: r.slug,
      name: localizedCardName(r.card, locale),
      number: r.card.number,
      priceFormatted: r.card[priceKey] != null ? formatMoney(r.card[priceKey]!, locale) : null,
      image: localizeCardImage(r.card.image!, locale),
      imageEn: r.card.image!,
    }));
}

export async function getCardPage(slug: string, locale: Locale): Promise<CardPageData | null> {
  const idx = await cardIndex();
  const entry = idx.slugToCard.get(slug);
  if (!entry) return null;
  const catalog = getSetById(entry.setId);
  const snapshot = await getSnapshot();
  const snap = snapshot.sets[entry.setId];
  if (!catalog || !snap) return null;
  const ranked = idx.bySet.get(entry.setId) ?? [];
  const rankIdx = ranked.findIndex((r) => r.card.id === entry.cardId);
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
    related: relatedOf(ranked, slug, snap, locale),
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
  if (!data) return {};
  return pageMetadata(locale, "card", {
    slug,
    vars: {
      card: data.cardName,
      set: data.setName,
      price: data.priceFormatted ?? (locale === "fr" ? "à venir" : "TBD"),
    },
  });
}
