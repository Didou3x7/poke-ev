import type { PricedCard, SealedPrice } from "../ev/types";
import { normalizeRarity } from "../ev/rarity";
import { TcggoClient, type TcggoCard, type TcggoEpisode, type TcggoProduct } from "../api/tcggo";

/**
 * PriceProvider — the seam between the EV pipeline and any price source.
 * Adding a new source (PriceCharting, manual CSV…) means implementing this
 * interface; nothing in the EV logic or the snapshot builder changes.
 */

export interface ProviderSet {
  /** Provider-side identifier (TCGGO episode id). */
  externalId: number | string;
  name: string;
  releaseDate: string | null;
  logo: string | null;
  symbol: string | null;
}

export interface PriceProvider {
  listSets(): Promise<ProviderSet[]>;
  /** All cards of a set, with both market prices when available. */
  cards(externalId: number | string): Promise<PricedCard[]>;
  /** Sealed products of a set (displays, boosters, ETBs…). */
  sealedProducts(externalId: number | string): Promise<SealedPrice[]>;
  /** HTTP calls consumed so far (for budget reporting). */
  callsUsed(): number;
}

/** Classify a sealed product name into booster / display / etb, or null to skip. */
export function classifySealed(name: string): SealedPrice["kind"] | null {
  const n = name.toLowerCase();
  // Drop tins, cases, lots, bundles and accessories: their prices (10× cases,
  // mini-tin displays, premium collections…) would distort the per-product
  // comparison the app makes against EV.
  if (
    /(code card|online|digital|redemption|mini ?tin|\btin\b|\bcase\b|\blot\b|\bhalf\b|bundle|blister|collection|premium|\bpin\b|binder|portfolio|sleeve|playmat|poster|sticker|\bdeck\b|build ?& ?battle|prerelease|tournament)/.test(n)
  ) {
    return null;
  }
  if (/(booster box|booster display|display box)/.test(n)) return "display";
  if (/(elite trainer box|\betb\b)/.test(n)) return "etb";
  // A single pack is named "<set> Booster Pack" — not a box/display/bundle, and
  // not a "Booster Energy Capsule" card (which has no "pack").
  if (/booster pack/.test(n) && !/(box|display|\bbundle\b)/.test(n)) {
    return "booster";
  }
  return null;
}

function mapCard(raw: TcggoCard): PricedCard {
  const cm = raw.prices?.cardmarket;
  const tp = raw.prices?.tcgplayer;
  return {
    id: String(raw.id),
    name: raw.name,
    number: raw.localId != null ? String(raw.localId) : null,
    rarity: normalizeRarity(raw.rarity),
    rawRarity: raw.rarity ?? null,
    prices: {
      eur: cm?.lowest_near_mint_FR ?? cm?.lowest_near_mint ?? null,
      usd: tp?.market_price ?? tp?.mid_price ?? null,
    },
    image: raw.image ?? null,
  };
}

function mapProduct(raw: TcggoProduct): SealedPrice | null {
  const kind = classifySealed(raw.name);
  if (!kind) return null;
  const cm = raw.prices?.cardmarket;
  const tp = raw.prices?.tcgplayer;
  // Sealed products expose Cardmarket lowest listings (FR market preferred) plus
  // 7d/30d averages as a fallback. TCGPlayer is usually absent for sealed, so
  // USD stays null on this source — we never fabricate it from EUR.
  const eur =
    cm?.lowest_FR ?? cm?.lowest_FR_EU_only ?? cm?.lowest ?? cm?.["30d_average"] ?? cm?.["7d_average"] ?? null;
  const usd = tp?.market_price ?? tp?.mid_price ?? null;
  if (eur == null && usd == null) return null; // no usable price → skip the product
  return {
    kind,
    name: raw.name,
    prices: { eur, usd },
    image: raw.image ?? null,
  };
}

export class TcggoProvider implements PriceProvider {
  constructor(private readonly client: TcggoClient) {}

  async listSets(): Promise<ProviderSet[]> {
    const episodes = await this.client.episodes();
    return episodes.map((e: TcggoEpisode) => ({
      externalId: e.id,
      name: e.name,
      releaseDate: e.releaseDate ?? null,
      logo: e.logo ?? null,
      symbol: e.symbol ?? null,
    }));
  }

  async cards(externalId: number | string): Promise<PricedCard[]> {
    return (await this.client.cards(externalId)).map(mapCard);
  }

  async sealedProducts(externalId: number | string): Promise<SealedPrice[]> {
    return (await this.client.products(externalId))
      .map(mapProduct)
      .filter((p): p is SealedPrice => p !== null);
  }

  callsUsed(): number {
    return this.client.callsUsed;
  }
}
