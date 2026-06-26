// INTRADAY cascade refresh — keeps the highest-value sets fresh between the once-a-day full
// rebuild. Vercel Pro unlocks frequent on-time crons, so this runs every few hours and
// re-prices only the TOP-N sets by EV (where prices move most and traffic concentrates), then
// revalidates their pages and pings IndexNow so search engines recrawl the new prices fast.
// The heavy 128-set rebuild + movers/new-set radar stays in the daily /api/cron/refresh-snapshot.
import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { buildTcgdexSnapshot } from "@/lib/data/build-tcgdex";
import { readBundledSnapshot, isSnapshot } from "@/lib/data/snapshot";
import { EMPTY_SNAPSHOT, type Snapshot } from "@/lib/data/snapshot-types";
import { SITE_URL } from "@/lib/i18n/config";
import { pingIndexNow } from "@/lib/ops/indexnow";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const TOP_N = 20;

async function readPriorFromBlob(): Promise<Snapshot | null> {
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: "snapshot.json", limit: 1 });
    if (!blobs[0]) return null;
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    if (!res.ok) return null;
    const parsed = (await res.json()) as unknown;
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Highest-EV sets — the most valuable + most-viewed, where prices move most. */
function topSetIds(snap: Snapshot, n: number): string[] {
  return Object.entries(snap.sets)
    .filter(([, s]) => s.ev != null)
    .sort((a, b) => (b[1].ev!.en.packEv ?? 0) - (a[1].ev!.en.packEv ?? 0))
    .slice(0, n)
    .map(([id]) => id);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN not configured" }, { status: 503 });
  }

  const prior = (await readPriorFromBlob()) ?? readBundledSnapshot() ?? EMPTY_SNAPSHOT;
  const only = topSetIds(prior, TOP_N);
  if (only.length === 0) return NextResponse.json({ ok: true, skipped: "no EV sets in prior" });

  const logs: string[] = [];
  const snapshot = await buildTcgdexSnapshot({ prior, only, maxMillis: 240_000, log: (m) => logs.push(m) });

  const { put } = await import("@vercel/blob");
  await put("snapshot.json", JSON.stringify(snapshot), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });

  // Reflect the new prices immediately instead of waiting out the 1h ISR window.
  for (const id of only) {
    revalidatePath(`/sets/${id}`);
    revalidatePath(`/en/sets/${id}`);
  }
  for (const p of ["/", "/en", "/sets", "/en/sets"]) revalidatePath(p);

  const urls = only.flatMap((id) => [`${SITE_URL}/sets/${id}`, `${SITE_URL}/en/sets/${id}`]);
  const indexnow = await pingIndexNow([...urls, `${SITE_URL}/`, `${SITE_URL}/en`]);

  return NextResponse.json({ ok: true, refreshed: only.length, indexnow, generatedAt: snapshot.generatedAt });
}
