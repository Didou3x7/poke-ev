import type { PricedCard, SealedPrice } from "../ev/types";
import { normalizeRarity } from "../ev/rarity";
import type { PriceProvider, ProviderSet } from "./provider";

/**
 * TCGdex price source — FREE, no API key, no hard rate limit. Provides real
 * Cardmarket (EUR) and TCGPlayer (USD) prices per card, refreshed daily.
 *
 * Pricing is language-independent (Cardmarket is the EU market, TCGPlayer the
 * US one), so one fetch per card yields both. TCGdex has no sealed-product
 * pricing, so `sealedProducts` returns []. The mapping catalogId → TCGdex setId
 * lives in data/sources/tcgdex-sets.json.
 */

export const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";
const TCGDEX_ROOT = "https://api.tcgdex.net/v2";

/**
 * Localized card names for a set, keyed by id AND by localId. Card prices are
 * language-agnostic so they're fetched once (in EN); names are not, so this
 * one extra call per set/language fills in the localized names.
 */
export async function fetchSetCardNames(
  setId: string,
  lang: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, string>> {
  const set = await fetchJson<{ cards: { id: string; localId: string | number; name: string }[] }>(
    `${TCGDEX_ROOT}/${lang}/sets/${setId}`,
    fetchImpl,
  );
  const map = new Map<string, string>();
  for (const c of set?.cards ?? []) {
    map.set(c.id, c.name);
    map.set(String(c.localId), c.name);
  }
  return map;
}

interface TcgdexSetCard {
  id: string;
  localId: string | number;
  name: string;
  image?: string | null;
}

interface TcgdexCard {
  id: string;
  localId?: string | number;
  name: string;
  rarity?: string | null;
  image?: string | null;
  pricing?: {
    cardmarket?: { low?: number | null; avg?: number | null; trend?: number | null } | null;
    tcgplayer?: Record<string, { marketPrice?: number | null; lowPrice?: number | null; midPrice?: number | null }> | null;
  } | null;
}

async function fetchJson<T>(url: string, fetchImpl: typeof fetch, retries = 2): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, { headers: { accept: "application/json" } });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 404) return null;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
  }
  return null;
}

/** Best TCGPlayer USD market price across variants (holofoil → normal → reverse). */
function tcgplayerUsd(card: TcgdexCard): number | null {
  const tp = card.pricing?.tcgplayer;
  if (!tp) return null;
  const order = ["holofoil", "reverseHolofoil", "normal", "1stEditionHolofoil", "unlimitedHolofoil"];
  for (const key of order) {
    const v = tp[key]?.marketPrice ?? tp[key]?.midPrice ?? tp[key]?.lowPrice;
    if (v != null && v > 0) return v;
  }
  for (const variant of Object.values(tp)) {
    const v = variant?.marketPrice ?? variant?.midPrice ?? variant?.lowPrice;
    if (v != null && v > 0) return v;
  }
  return null;
}

function cardmarketEur(card: TcgdexCard): number | null {
  const cm = card.pricing?.cardmarket;
  if (!cm) return null;
  // Use the trend (market) price to match TCGPlayer's marketPrice on the EN side
  // — both represent real market value, so FR/EN EVs are comparable.
  return cm.trend ?? cm.avg ?? cm.low ?? null;
}

function mapCard(card: TcgdexCard): PricedCard {
  return {
    id: card.id,
    name: card.name,
    number: card.localId != null ? String(card.localId) : null,
    rarity: normalizeRarity(card.rarity),
    rawRarity: card.rarity ?? null,
    prices: { eur: cardmarketEur(card), usd: tcgplayerUsd(card) },
    image: card.image ? `${card.image}/high.webp` : null,
  };
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export class TcgdexProvider implements PriceProvider {
  private calls = 0;
  constructor(
    /** catalogId → TCGdex setId */
    private readonly setMap: Record<string, string>,
    private readonly opts: { concurrency?: number; fetchImpl?: typeof fetch } = {},
  ) {}

  private get fetchImpl() {
    return this.opts.fetchImpl ?? fetch;
  }

  async listSets(): Promise<ProviderSet[]> {
    // The catalog drives matching; we expose mapped sets keyed by TCGdex id.
    return Object.entries(this.setMap).map(([catalogId, tcgdexId]) => ({
      externalId: tcgdexId,
      name: catalogId,
      releaseDate: null,
      logo: `https://assets.tcgdex.net/en/${tcgdexBranch(tcgdexId)}/${tcgdexId}/logo.webp`,
      symbol: `https://assets.tcgdex.net/en/${tcgdexBranch(tcgdexId)}/${tcgdexId}/symbol.webp`,
    }));
  }

  async cards(externalId: number | string): Promise<PricedCard[]> {
    const setId = String(externalId);
    this.calls++;
    const set = await fetchJson<{ cards: TcgdexSetCard[] }>(`${TCGDEX_BASE}/sets/${setId}`, this.fetchImpl);
    if (!set?.cards) return [];
    const cards = await mapLimit(set.cards, this.opts.concurrency ?? 16, async (c) => {
      this.calls++;
      const full = await fetchJson<TcgdexCard>(`${TCGDEX_BASE}/cards/${c.id}`, this.fetchImpl);
      return full ? mapCard(full) : null;
    });
    return cards.filter((c): c is PricedCard => c !== null);
  }

  async sealedProducts(): Promise<SealedPrice[]> {
    // TCGdex has no sealed-product pricing.
    return [];
  }

  callsUsed(): number {
    return this.calls;
  }
}

/** TCGdex serie branch for an asset path (sv03.5 → sv, swsh7 → swsh, me01 → me, cel25 → cel). */
function tcgdexBranch(setId: string): string {
  const m = setId.match(/^[a-z]+/);
  return m ? m[0] : setId;
}
