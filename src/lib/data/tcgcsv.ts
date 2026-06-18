import type { PricedCard, SealedPrice } from "../ev/types";
import { classifySealed, type PriceProvider, type ProviderSet } from "./provider";

/**
 * TCGCSV provider — a FREE, key-less public mirror of TCGplayer data
 * (tcgcsv.com, Pokémon = categoryId 3), refreshed daily. We use it ONLY for
 * sealed-product prices (display / booster / ETB); card + EV data keep coming
 * from TCGdex. No API key, no rate/credit limit, full set coverage.
 *
 * Prices are TCGplayer USD market values. EUR is derived from the snapshot's FX
 * rate when provided (an approximation of the FR/Cardmarket price — the native
 * Cardmarket EUR sealed feed is paywalled). USD verdicts are exact on the EN
 * site; FR verdicts are indicative.
 */

const BASE = "https://tcgcsv.com/tcgplayer/3";
const UA = "PokeEV/1.0 (+https://pokeev.com sealed price sync)";

interface TcgcsvGroup {
  groupId: number;
  name: string;
}
interface TcgcsvProduct {
  productId: number;
  name: string;
  imageUrl?: string | null;
}
interface TcgcsvPrice {
  productId: number;
  marketPrice?: number | null;
  midPrice?: number | null;
  lowPrice?: number | null;
  highPrice?: number | null;
}

/**
 * Best usable USD for a price row: the realised market price, else the mid, else
 * the low ask. highPrice is skipped on purpose — for illiquid vintage sealed it
 * is a single inflated ask (e.g. a $100k Base Set box listing) that would poison
 * the comparison. Returns null when the row carries no usable number.
 */
function rowUsd(p: TcgcsvPrice | undefined): number | null {
  if (!p) return null;
  return p.marketPrice ?? p.midPrice ?? p.lowPrice ?? null;
}

/** Drop TCGplayer's "CODE##: " / "SV: " set-name prefix so names match the catalog. */
function stripPrefix(name: string): string {
  return name.replace(/^[A-Za-z0-9.&'’-]{1,8}:\s*/, "").trim();
}

export class TcgcsvProvider implements PriceProvider {
  private used = 0;
  /** EUR per USD multiplier (1 / eurUsd); when null, EUR is left null. */
  private readonly eurPerUsd: number | null;

  constructor(opts: { eurUsd?: number | null } = {}) {
    this.eurPerUsd = opts.eurUsd && opts.eurUsd > 0 ? 1 / opts.eurUsd : null;
  }

  private async getJson<T>(path: string): Promise<T[]> {
    this.used += 1;
    const res = await fetch(`${BASE}${path}`, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`tcgcsv ${path} → ${res.status}`);
    const body = (await res.json()) as { results?: T[] };
    return body.results ?? [];
  }

  async listSets(): Promise<ProviderSet[]> {
    const groups = await this.getJson<TcgcsvGroup>("/groups");
    return groups.map((g) => ({
      externalId: g.groupId,
      name: stripPrefix(g.name),
      releaseDate: null,
      logo: null,
      symbol: null,
    }));
  }

  async cards(): Promise<PricedCard[]> {
    throw new Error("TcgcsvProvider is sealed-only; card prices come from TCGdex");
  }

  async sealedProducts(externalId: number | string): Promise<SealedPrice[]> {
    const [products, prices] = await Promise.all([
      this.getJson<TcgcsvProduct>(`/${externalId}/products`),
      this.getJson<TcgcsvPrice>(`/${externalId}/prices`),
    ]);
    // A product can carry several price rows (subtypes); keep the highest usable
    // value so a present "Normal" row is never shadowed by an empty variant row.
    const priceOf = new Map<number, number>();
    for (const p of prices) {
      const usd = rowUsd(p);
      if (usd == null) continue;
      const prev = priceOf.get(p.productId);
      if (prev == null || usd > prev) priceOf.set(p.productId, usd);
    }

    const out: SealedPrice[] = [];
    for (const product of products) {
      const kind = classifySealed(product.name);
      if (!kind) continue;
      const usd = priceOf.get(product.productId) ?? null;
      if (usd == null) continue;
      out.push({
        kind,
        name: product.name,
        prices: {
          usd,
          eur: this.eurPerUsd != null ? Math.round(usd * this.eurPerUsd * 100) / 100 : null,
        },
        image: product.imageUrl ?? null,
      });
    }
    return out;
  }

  callsUsed(): number {
    return this.used;
  }
}
