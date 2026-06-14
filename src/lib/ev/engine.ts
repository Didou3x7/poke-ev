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

function buildPools(cards: PricedCard[], market: Market): Map<RarityId, RarityPool> {
  const pools = new Map<RarityId, RarityPool>();
  for (const card of cards) {
    if (!card.rarity) continue;
    let pool = pools.get(card.rarity);
    if (!pool) {
      pool = { rarity: card.rarity, cards: [], values: [], sumValue: 0, sumValueSq: 0 };
      pools.set(card.rarity, pool);
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
  const pools = buildPools(cards, market);
  const perPack = expectedPerPackByRarity(config.slots);

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
  contributions.sort((a, b) => b.evContribution - a.evContribution);

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
