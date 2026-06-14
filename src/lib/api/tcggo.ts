/**
 * TCGGO (Pokémon TCG API on RapidAPI) client. SERVER-SIDE ONLY.
 *
 * Auth: the key travels as the `rapidapi-key` QUERY PARAMETER (this API does
 * not read the usual RapidAPI headers). The key comes from RAPIDAPI_KEY and
 * never reaches the client bundle — this module throws if imported in a
 * browser context.
 *
 * Rate limits (Basic plan): 100 requests/day, 30/minute. Every call goes
 * through `budgetedFetch`, which counts calls and refuses to exceed the
 * per-run budget — callers decide how to spread work across days.
 */
if (typeof window !== "undefined") {
  throw new Error("tcggo.ts is server-only: it must never be bundled client-side (API key safety)");
}

export const TCGGO_BASE = "https://pokemon-tcg-api.p.rapidapi.com";

export interface TcggoEpisode {
  id: number;
  name: string;
  slug?: string | null;
  serie?: { name?: string | null } | null;
  releaseDate?: string | null;
  logo?: string | null;
  symbol?: string | null;
  cardCount?: { total?: number | null; official?: number | null } | null;
}

export interface TcggoCardPrices {
  cardmarket?: {
    // card-level fields
    lowest_near_mint?: number | null;
    lowest_near_mint_FR?: number | null;
    avg7?: number | null;
    avg30?: number | null;
    // sealed-product fields (different schema on /products)
    lowest?: number | null;
    lowest_EU_only?: number | null;
    lowest_FR?: number | null;
    lowest_FR_EU_only?: number | null;
    "30d_average"?: number | null;
    "7d_average"?: number | null;
  } | null;
  tcgplayer?: {
    market_price?: number | null;
    mid_price?: number | null;
  } | null;
}

export interface TcggoCard {
  id: number | string;
  name: string;
  localId?: string | number | null;
  rarity?: string | null;
  image?: string | null;
  prices?: TcggoCardPrices | null;
}

export interface TcggoProduct {
  id: number | string;
  name: string;
  type?: string | null;
  image?: string | null;
  prices?: TcggoCardPrices | null;
}

export class BudgetExhaustedError extends Error {
  constructor(budget: number) {
    super(`TCGGO call budget exhausted (${budget} requests)`);
    this.name = "BudgetExhaustedError";
  }
}

export interface TcggoClientOptions {
  apiKey: string;
  /** Hard cap on the number of HTTP calls this client instance may make. */
  budget: number;
  /** Minimum delay between calls in ms — keeps us under 30 req/min. */
  minIntervalMs?: number;
  fetchImpl?: typeof fetch;
}

export class TcggoClient {
  private used = 0;
  private lastCall = 0;
  private readonly opts: Required<TcggoClientOptions>;

  constructor(options: TcggoClientOptions) {
    if (!options.apiKey) throw new Error("RAPIDAPI_KEY is required");
    this.opts = {
      minIntervalMs: 2100, // 30/min with margin
      fetchImpl: fetch,
      ...options,
    };
  }

  get callsUsed(): number {
    return this.used;
  }

  get callsRemaining(): number {
    return Math.max(0, this.opts.budget - this.used);
  }

  private async budgetedFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
    if (this.used >= this.opts.budget) throw new BudgetExhaustedError(this.opts.budget);
    const wait = this.lastCall + this.opts.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    const url = new URL(`${TCGGO_BASE}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    // Auth via query parameter — this API does not accept the header form.
    url.searchParams.set("rapidapi-key", this.opts.apiKey);

    this.used++;
    this.lastCall = Date.now();
    const res = await this.opts.fetchImpl(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`TCGGO ${path} → HTTP ${res.status}`);
    }
    return res.json();
  }

  private static unwrapList<T>(payload: unknown): T[] {
    if (Array.isArray(payload)) return payload as T[];
    if (payload && typeof payload === "object") {
      const obj = payload as Record<string, unknown>;
      for (const key of ["data", "episodes", "cards", "products", "results"]) {
        if (Array.isArray(obj[key])) return obj[key] as T[];
      }
    }
    return [];
  }

  async episodes(): Promise<TcggoEpisode[]> {
    return TcggoClient.unwrapList<TcggoEpisode>(await this.budgetedFetch("/episodes"));
  }

  async cards(episodeId: number | string): Promise<TcggoCard[]> {
    return TcggoClient.unwrapList<TcggoCard>(await this.budgetedFetch(`/episodes/${episodeId}/cards`));
  }

  async products(episodeId: number | string): Promise<TcggoProduct[]> {
    return TcggoClient.unwrapList<TcggoProduct>(await this.budgetedFetch(`/episodes/${episodeId}/products`));
  }
}
