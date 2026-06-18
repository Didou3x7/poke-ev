import { NextResponse, type NextRequest } from "next/server";
import { buildTcgdexSnapshot } from "@/lib/data/build-tcgdex";
import { mergeSealedPrices } from "@/lib/data/sealed-merge";
import { TcgcsvProvider } from "@/lib/data/tcgcsv";
import { getAllSets, getPullRates } from "@/lib/data/catalog";
import { isSnapshot, readBundledSnapshot } from "@/lib/data/snapshot";
import { EMPTY_SNAPSHOT, type Snapshot } from "@/lib/data/snapshot-types";

/**
 * Daily snapshot refresh, invoked by Vercel Cron (see vercel.json).
 *
 * Card + EV data come from TCGdex (free, no key): real Cardmarket EUR +
 * TCGPlayer USD card prices for every EV set. Sealed-product prices
 * (display/booster/ETB) are then merged in from TCGCSV (free TCGplayer mirror,
 * no key, no limit). The card snapshot is persisted to Vercel Blob FIRST, so a
 * slow sealed step can never lose the day's refresh. With no Blob token, the
 * app simply serves the snapshot committed in /data.
 */

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function readPriorFromBlob(): Promise<Snapshot | null> {
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: "snapshot.json", limit: 1 });
    if (!blobs[0]) return null;
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    if (!res.ok) return null;
    // Validate the shape before trusting it as the refresh base — a corrupt or
    // partially-written blob must fall back to the bundled snapshot, never seed
    // the next persist with garbage.
    const parsed = (await res.json()) as unknown;
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
  const logs: string[] = [];

  const { put } = await import("@vercel/blob");
  const persist = (snap: Snapshot) =>
    put("snapshot.json", JSON.stringify(snap), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });

  // Resumable build: stalest sets first, partial progress persisted every 25
  // sets, and a soft deadline (~230s) that leaves headroom under maxDuration for
  // the sealed step + final write — so a slow day never times out mid-build and
  // loses work; unreached sets keep prior data and lead the next run.
  let snapshot = await buildTcgdexSnapshot({
    prior,
    maxMillis: 230_000,
    onProgress: async (snap) => {
      await persist(snap);
    },
    log: (m) => logs.push(m),
  });

  // Persist card/EV data first — robust if the sealed step is slow or fails.
  await persist(snapshot);

  // Best-effort sealed-product enrichment from TCGCSV (free, no key, no limit).
  let sealedMatched = 0;
  try {
    const provider = new TcgcsvProvider({ eurUsd: snapshot.fx?.eurUsd });
    const res = await mergeSealedPrices({
      snapshot,
      provider,
      catalogSets: getAllSets(),
      pullRates: getPullRates(),
      budget: 1000,
      log: (m) => logs.push(m),
    });
    snapshot = res.snapshot;
    sealedMatched = res.matched.length;
    await persist(snapshot);
  } catch (e) {
    logs.push(`sealed merge failed: ${(e as Error).message}`);
  }

  return NextResponse.json({
    ok: true,
    sets: Object.keys(snapshot.sets).length,
    sealedMatched,
    generatedAt: snapshot.generatedAt,
    fx: snapshot.fx,
    logs,
  });
}
