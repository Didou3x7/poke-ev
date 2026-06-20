import type {
  CardContribution,
  Market,
  PackSlot,
  PricedCard,
  PullRateConfig,
  RarityBreakdown,
  SetEv,
} from "./types";
import type { RarityId } from "./rarity";

/**
 * Core EV computation. Pure, deterministic, no I/O.
 *
 * Model — for each rarity r:
 *   expectedPerPack(r) = Σ over slots of count × P(slot resolves to r)
 *   P(pulling a specific card of rarity r) = expectedPerPack(r) / cardsInSet(r)
 *   (uniform pull within a rarity)
 *
 * Cards without a usable price contribute 0 value but keep their probability
 * mass, so the EV is a lower bound and never an invention. The share of priced
 * cards is reported as `priceCompleteness`.
 */

function cardValue(card: PricedCard, market: Market): number | null {
  const v = market === "fr" ? card.prices.eur : card.prices.usd;
  return v != null && Number.isFinite(v) && v >= 0 ? v : null;
}

interface RarityPool {
  rarity: RarityId;
  cards: PricedCard[];
  values: number[]; // priced cards only
  sumValue: number;
  sumValueSq: number;
}

// Rarity tags that are pull-equivalent: a config often buckets the whole group
// under ONE key, but the pokemontcg.io rarity overlay may tag a set's cards with
// a sibling key — e.g. "rare" rares re-tagged "rare-holo", or Shiny-Vault cards
// split into "shiny-rare" + "shiny-vault". When that happens those cards land in
// a bucket no slot references → silently 0 EV.
const RARITY_ALIAS_GROUPS: RarityId[][] = [
  ["rare", "rare-holo"],
  ["shiny-vault", "shiny-rare"],
];

/**
 * Fold a card's rarity into the sibling key the config actually references, but
 * ONLY when the config references exactly one member of the group. Configs that
 * reference several members keep them separate (no behaviour change).
 */
function canonicalRarity(rarity: RarityId, referenced: Set<RarityId>): RarityId {
  if (referenced.has(rarity)) return rarity;
  for (const group of RARITY_ALIAS_GROUPS) {
    if (!group.includes(rarity)) continue;
    const target = group.find((r) => r !== rarity && referenced.has(r));
    if (target) return target;
  }
  return rarity;
}

export const BASIC_ENERGY = /^(grass|fire|water|lightning|psychic|fighting|darkness|metal|fairy) energy$/i;
const MISPRICED_ENERGY_USD = 5;

/**
 * A basic Energy tagged common/uncommon yet priced like a hit is a MIS-CLASSIFIED
 * holographic energy insert (e.g. HGSS Darkness Energy ≈ $54, Call of Legends holo
 * energies $40–130) — it is NOT pulled at the common-slot rate, so leaving it in the
 * common pool grossly inflates the pack EV. Drop it from the pull pools.
 * Deliberately value-gated, not era-gated: genuinely cheap basic energies (Base Set
 * ≈ $0.40) ARE common-slot pulls and stay; holo energies already tagged rare/rare-holo
 * (ex Holon Phantoms) aren't common/uncommon so they're untouched and keep their rate.
 */
function isMispricedEnergy(card: PricedCard): boolean {
  if (card.rarity !== "common" && card.rarity !== "uncommon") return false;
  if (!BASIC_ENERGY.test(card.name.trim())) return false;
  return Math.max(card.prices.eur ?? 0, card.prices.usd ?? 0) >= MISPRICED_ENERGY_USD;
}

function buildPools(cards: PricedCard[], market: Market, referenced: Set<RarityId>): Map<RarityId, RarityPool> {
  const pools = new Map<RarityId, RarityPool>();
  for (const card of cards) {
    if (!card.rarity || isMispricedEnergy(card)) continue;
    const rarity = canonicalRarity(card.rarity, referenced);
    let pool = pools.get(rarity);
    if (!pool) {
      pool = { rarity, cards: [], values: [], sumValue: 0, sumValueSq: 0 };
      pools.set(rarity, pool);
    }
    pool.cards.push(card);
    const v = cardValue(card, market);
    if (v != null) {
      pool.values.push(v);
      pool.sumValue += v;
      pool.sumValueSq += v * v;
    }
  }
  return pools;
}

function expectedPerPackByRarity(slots: PackSlot[]): Map<RarityId, number> {
  const out = new Map<RarityId, number>();
  for (const slot of slots) {
    for (const [rarity, p] of Object.entries(slot.distribution) as [RarityId, number][]) {
      if (!p) continue;
      out.set(rarity, (out.get(rarity) ?? 0) + slot.count * p);
    }
  }
  return out;
}

/**
 * Analytic per-pack variance under slot independence.
 * For one slot draw: E[v] = Σ_r P(r)·mean_r, E[v²] = Σ_r P(r)·meanSq_r,
 * Var = E[v²] − E[v]². A slot with count n counts n independent draws.
 * Means treat unpriced cards as 0 (consistent with the EV lower bound).
 */
function packVariance(slots: PackSlot[], pools: Map<RarityId, RarityPool>): number {
  let variance = 0;
  for (const slot of slots) {
    let ev = 0;
    let evSq = 0;
    for (const [rarity, p] of Object.entries(slot.distribution) as [RarityId, number][]) {
      if (!p) continue;
      const pool = pools.get(rarity);
      if (!pool || pool.cards.length === 0) continue;
      const n = pool.cards.length;
      ev += p * (pool.sumValue / n);
      evSq += p * (pool.sumValueSq / n);
    }
    variance += slot.count * Math.max(0, evSq - ev * ev);
  }
  return variance;
}

export interface ComputeSetEvOptions {
  /** How many top contributing cards to report. Default 10. */
  topCardsCount?: number;
}

export function computeSetEv(
  cards: PricedCard[],
  config: PullRateConfig,
  market: Market,
  options: ComputeSetEvOptions = {},
): SetEv {
  const perPack = expectedPerPackByRarity(config.slots);
  const pools = buildPools(cards, market, new Set(perPack.keys()));

  const rarityBreakdown: RarityBreakdown[] = [];
  const contributions: CardContribution[] = [];
  let packEv = 0;

  for (const [rarity, expected] of perPack) {
    const pool = pools.get(rarity);
    const cardsInSet = pool?.cards.length ?? 0;
    if (!pool || cardsInSet === 0) {
      rarityBreakdown.push({ rarity, cardsInSet: 0, expectedPerPack: expected, meanValue: 0, evContribution: 0 });
      continue;
    }
    // Mean over ALL cards of the rarity, unpriced counted as 0 (lower bound).
    const meanValue = pool.sumValue / cardsInSet;
    const evContribution = expected * meanValue;
    packEv += evContribution;
    rarityBreakdown.push({ rarity, cardsInSet, expectedPerPack: expected, meanValue, evContribution });

    const pCard = expected / cardsInSet;
    for (const card of pool.cards) {
      const v = cardValue(card, market);
      if (v == null || v <= 0) continue;
      contributions.push({ card, probabilityPerPack: pCard, value: v, evContribution: pCard * v });
    }
  }

  rarityBreakdown.sort((a, b) => b.evContribution - a.evContribution);
  // topCards is a "most valuable cards" showcase → rank by market value, not by
  // EV contribution (a frequent mid-price card carries more EV than a rare chase,
  // but users expect the priciest card on top). evContribution is kept per card.
  contributions.sort((a, b) => b.value - a.value);

  const knownRarityCards = cards.filter((c) => c.rarity != null);
  const pricedCount = knownRarityCards.filter((c) => cardValue(c, market) != null).length;

  return {
    market,
    currency: market === "fr" ? "EUR" : "USD",
    packEv,
    packStdDev: Math.sqrt(packVariance(config.slots, pools)),
    rarityBreakdown,
    topCards: contributions.slice(0, options.topCardsCount ?? 10),
    priceCompleteness: knownRarityCards.length === 0 ? 0 : pricedCount / knownRarityCards.length,
    unknownRarityCards: cards.length - knownRarityCards.length,
  };
}
