// "Biggest movers" — diff yesterday's snapshot against today's to surface the cards whose
// EUR market price moved the most. Feeds: (1) a Telegram alert to the owner, (2) the public
// /tendances · /en/trends pages (fresh daily content = an SEO magnet + IG post fodder).
//
// EUR is the canonical market for the diff (the FR site is the primary surface). Cards are
// matched across days by their in-set number (stable) and need a real price BOTH days above a
// floor, so a card going from "no quote" to a price — or a 0.20€ common — never shows as a mover.
import type { Snapshot, SnapshotCard } from "@/lib/data/snapshot-types";
import { getSetById } from "@/lib/data/catalog";

const MIN_PRICE_EUR = 5; // ignore sub-5€ cards — their listings are noisy
const MIN_PCT = 8; // ignore < 8% moves — not newsworthy

export interface MoverItem {
  setId: string;
  setName: string;
  cardName: string;
  cardNameFr: string | null;
  number: string | null;
  image: string | null;
  oldEur: number;
  newEur: number;
  pct: number; // signed % change
}

export interface MoversData {
  generatedAt: string;
  gainers: MoverItem[];
  losers: MoverItem[];
}

export const EMPTY_MOVERS: MoversData = { generatedAt: "1970-01-01T00:00:00.000Z", gainers: [], losers: [] };

const cardKey = (c: SnapshotCard) => c.number ?? c.name;

export function computeMovers(prior: Snapshot, next: Snapshot, limit = 30): MoversData {
  const items: MoverItem[] = [];
  for (const [setId, set] of Object.entries(next.sets)) {
    const priorSet = prior.sets[setId];
    if (!priorSet) continue;
    const priorByKey = new Map(priorSet.cards.map((c) => [cardKey(c), c]));
    const setName = getSetById(setId)?.nameEn ?? setId;
    for (const card of set.cards) {
      const old = priorByKey.get(cardKey(card));
      if (!old) continue;
      const oldEur = old.eur;
      const newEur = card.eur;
      if (oldEur == null || newEur == null || oldEur < MIN_PRICE_EUR) continue;
      const pct = ((newEur - oldEur) / oldEur) * 100;
      if (Math.abs(pct) < MIN_PCT) continue;
      items.push({
        setId,
        setName,
        cardName: card.name,
        cardNameFr: card.nameFr,
        number: card.number,
        image: card.image,
        oldEur,
        newEur,
        pct: Math.round(pct * 10) / 10,
      });
    }
  }
  const gainers = items.filter((i) => i.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, limit);
  const losers = items.filter((i) => i.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, limit);
  return { generatedAt: next.generatedAt, gainers, losers };
}

const MOVERS_PATH = "movers.json";

export async function writeMovers(data: MoversData): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const { put } = await import("@vercel/blob");
    await put(MOVERS_PATH, JSON.stringify(data), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch {
    /* best-effort */
  }
}

export async function readMovers(): Promise<MoversData> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return EMPTY_MOVERS;
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: MOVERS_PATH, limit: 1 });
    const b = blobs.find((x) => x.pathname === MOVERS_PATH);
    if (!b) return EMPTY_MOVERS;
    // Version-busted URL (?v=<uploadedAt>) → content is immutable per-URL, so force-cache is safe and
    // a new upload still lands instantly via its new URL. no-store here would bail /tendances and
    // /en/trends (both `revalidate = 3600` ISR pages that read this) from static to dynamic.
    const r = await fetch(`${b.url}?v=${encodeURIComponent(b.uploadedAt.toString())}`, { cache: "force-cache" });
    if (!r.ok) return EMPTY_MOVERS;
    return (await r.json()) as MoversData;
  } catch {
    return EMPTY_MOVERS;
  }
}
