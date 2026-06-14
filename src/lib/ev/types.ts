import type { RarityId } from "./rarity";

/** Which price market feeds the calculation — tied to UI language. */
export type Market = "fr" | "en";

export interface MarketPrice {
  /** Cardmarket lowest near-mint FR, in EUR. */
  eur: number | null;
  /** TCGPlayer market price, in USD. */
  usd: number | null;
}

/** A card as the EV engine sees it: identity, normalized rarity, prices. */
export interface PricedCard {
  id: string;
  name: string;
  number: string | null;
  rarity: RarityId | null;
  rawRarity: string | null;
  prices: MarketPrice;
  image: string | null;
}

/** One slot of a booster pack as described by a pull-rate file. */
export interface PackSlot {
  name: string;
  /** How many cards this slot yields per pack. */
  count: number;
  /** Probability of the slot resolving to each rarity. Must sum to 1. */
  distribution: Partial<Record<RarityId, number>>;
}

export type PullRateConfidence = "high" | "medium" | "low";

/** Parsed content of a data/pull-rates/{setId}.json file. */
export interface PullRateConfig {
  setId: string;
  era: string;
  confidence: PullRateConfidence;
  sources: string[];
  notes?: string;
  packSize: number;
  slots: PackSlot[];
  products: {
    display: { packs: number } | null;
    etb: { packs: number } | null;
  };
}

export type ProductKind = "booster" | "display" | "etb";

/** Sealed-product market prices from the API (per market). */
export interface SealedPrice {
  kind: ProductKind;
  name: string;
  prices: MarketPrice;
  image?: string | null;
}

/** Per-rarity aggregation used for breakdowns. */
export interface RarityBreakdown {
  rarity: RarityId;
  cardsInSet: number;
  /** Expected number of cards of this rarity per pack. */
  expectedPerPack: number;
  /** Mean market value of a card of this rarity. */
  meanValue: number;
  /** Contribution of the rarity to the pack EV (expectedPerPack × meanValue). */
  evContribution: number;
}

/** A single card's contribution to pack EV. */
export interface CardContribution {
  card: PricedCard;
  /** Probability of pulling this exact card in one pack. */
  probabilityPerPack: number;
  /** probabilityPerPack × value. */
  evContribution: number;
  value: number;
}

/** Full EV computation for one set in one market. */
export interface SetEv {
  market: Market;
  currency: "EUR" | "USD";
  /** EV of a single booster pack. */
  packEv: number;
  /** Per-pack value standard deviation (analytic, independence approximation). */
  packStdDev: number;
  rarityBreakdown: RarityBreakdown[];
  topCards: CardContribution[];
  /** Share of cards in the set carrying a usable price, 0..1. */
  priceCompleteness: number;
  /** Cards whose rarity could not be normalized (excluded from EV). */
  unknownRarityCards: number;
}

export interface VerdictInput {
  /** What the user paid for the product. */
  pricePaid: number;
  kind: ProductKind;
  packs: number;
  packEv: number;
  packStdDev: number;
  /** Real sealed market price for this product, when known. */
  sealedMarketPrice: number | null;
}

export type VerdictKind = "open" | "keep" | "unavailable";

export interface Verdict {
  kind: VerdictKind;
  /** EV of opening the product (packEv × packs). */
  openEv: number;
  /** openEv − pricePaid. */
  marginAbs: number;
  /** marginAbs / pricePaid, as a ratio (0.18 = +18 %). */
  marginPct: number;
  /** P(opened value > price paid), normal approximation across packs. */
  profitProbability: number;
  sealedMarketPrice: number | null;
  /** sealedMarketPrice − openEv when the sealed price is known. */
  sealedPremium: number | null;
}

export interface ConfidenceInput {
  pullRateConfidence: PullRateConfidence;
  priceCompleteness: number;
  /** Age of the price snapshot in days. */
  snapshotAgeDays: number;
}

export interface ConfidenceScore {
  /** 0..100 composite score. */
  score: number;
  label: "high" | "medium" | "low";
  parts: {
    pullRates: number;
    prices: number;
    freshness: number;
  };
}
