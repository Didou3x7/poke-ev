import type { PricedCard } from "../ev/types";

/**
 * pokemontcg.io price + image source. Provides real, per-printing Cardmarket
 * EUR + TCGPlayer USD prices and complete card images. We OVERLAY it onto the
 * TCGdex-built cards (TCGdex stays the source of FR card prints + names):
 * TCGdex's per-card EUR/USD can refer to DIFFERENT printings (variant mixing →
 * wrong prices), so pokemontcg.io's consistent per-card prices replace them,
 * and its images fill the ones TCGdex lacks (e.g. Celebrations Classic
 * Collection). Free, no key — one query per mapped set id.
 */

const PTCG_BASE = "https://api.pokemontcg.io/v2";

export interface PtcgCard {
  number: string;
  name: string;
  image: string | null;
  eur: number | null;
  usd: number | null;
}

interface PtcgApiCard {
  number?: string | number;
  name: string;
  images?: { small?: string; large?: string } | null;
  tcgplayer?: { prices?: Record<string, { market?: number | null; mid?: number | null; low?: number | null } | null> | null } | null;
  cardmarket?: { prices?: { trendPrice?: number | null; averageSellPrice?: number | null; avg7?: number | null } | null } | null;
}

/** Best TCGPlayer USD market price across printings (holo → reverse → normal → 1st ed). */
function ptcgUsd(card: PtcgApiCard): number | null {
  const prices = card.tcgplayer?.prices;
  if (!prices) return null;
  const order = ["holofoil", "reverseHolofoil", "normal", "1stEditionHolofoil", "unlimitedHolofoil", "1stEdition", "unlimited"];
  for (const k of order) {
    const v = prices[k]?.market ?? prices[k]?.mid ?? prices[k]?.low;
    if (v != null && v > 0) return v;
  }
  for (const variant of Object.values(prices)) {
    const v = variant?.market ?? variant?.mid ?? variant?.low;
    if (v != null && v > 0) return v;
  }
  return null;
}

function ptcgEur(card: PtcgApiCard): number | null {
  const p = card.cardmarket?.prices;
  const v = p?.trendPrice ?? p?.averageSellPrice ?? p?.avg7;
  return v != null && v > 0 ? v : null;
}

async function getJson<T>(url: string, fetchImpl: typeof fetch, retries = 5): Promise<T | null> {
  // A free pokemontcg.io API key (POKEMONTCG_API_KEY) raises the rate limit and
  // makes the daily build reliable; it works without one, just throttled harder.
  const key = process.env.POKEMONTCG_API_KEY;
  const headers: Record<string, string> = { accept: "application/json" };
  if (key) headers["X-Api-Key"] = key;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchImpl(url, { headers });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 404) return null;
      // 429 (rate limit) → back off longer and longer
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
        continue;
      }
    } catch {
      /* network error → retry */
    }
    await new Promise((r) => setTimeout(r, 600 * (i + 1)));
  }
  return null;
}

/** Every card across the given pokemontcg.io set id(s), with prices + image. */
export async function fetchPtcgCards(setIds: string[], fetchImpl: typeof fetch = fetch): Promise<PtcgCard[]> {
  const out: PtcgCard[] = [];
  for (const setId of setIds) {
    for (let page = 1; page <= 4; page++) {
      const q = encodeURIComponent(`set.id:${setId}`);
      const data = await getJson<{ data: PtcgApiCard[] }>(
        `${PTCG_BASE}/cards?q=${q}&pageSize=250&page=${page}&select=number,name,images,tcgplayer,cardmarket`,
        fetchImpl,
      );
      const cards = data?.data ?? [];
      for (const c of cards) {
        out.push({
          number: c.number != null ? String(c.number) : "",
          name: c.name,
          image: c.images?.large ?? c.images?.small ?? null,
          eur: ptcgEur(c),
          usd: ptcgUsd(c),
        });
      }
      if (cards.length < 250) break;
    }
  }
  return out;
}

// ★/☆ ("Gold Star" cards) are spelled as the word "Star" by TCGdex but as the
// symbol by pokemontcg.io — fold both to "star" so e.g. "Umbreon Star" matches
// "Umbreon ★" (Celebrations Classic Collection).
const norm = (s: string) => s.toLowerCase().replace(/[★☆]/g, "star").replace(/[^a-z0-9]/g, "");
// TCGdex zero-pads collector numbers ("072"), pokemontcg.io doesn't ("72").
const numKey = (n: string) => n.replace(/^0+(?=\d)/, "");

/**
 * Overlay pokemontcg.io prices + fill missing images onto TCGdex `PricedCard`s,
 * in place. Match by collector number (disambiguating same-number variants by
 * name), then by a unique name (covers Celebrations' "4A"-style numbers that
 * differ between the two sources). Real prices win; the TCGdex value is kept
 * only where pokemontcg.io has none. Returns how many cards were matched.
 */
export function overlayPtcgPrices(cards: PricedCard[], ptcg: PtcgCard[]): number {
  const byNumber = new Map<string, PtcgCard[]>();
  const byName = new Map<string, PtcgCard[]>();
  for (const p of ptcg) {
    if (p.number) {
      const k = numKey(p.number);
      (byNumber.get(k) ?? byNumber.set(k, []).get(k)!).push(p);
    }
    const nk = norm(p.name);
    (byName.get(nk) ?? byName.set(nk, []).get(nk)!).push(p);
  }
  let matched = 0;
  for (const c of cards) {
    const num = numKey(c.number != null ? String(c.number) : "");
    let m: PtcgCard | undefined;
    const numCands = byNumber.get(num) ?? [];
    if (numCands.length === 1) m = numCands[0];
    else if (numCands.length > 1) m = numCands.find((p) => norm(p.name) === norm(c.name));
    if (!m) {
      const nameCands = byName.get(norm(c.name)) ?? [];
      if (nameCands.length === 1) m = nameCands[0];
    }
    if (!m) continue;
    matched++;
    if (m.eur != null) c.prices.eur = m.eur;
    if (m.usd != null) c.prices.usd = m.usd;
    if (!c.image && m.image) c.image = m.image;
  }
  return matched;
}
