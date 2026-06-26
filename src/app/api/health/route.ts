import { NextRequest, NextResponse } from "next/server";
import { getSnapshot } from "@/lib/data/snapshot";
import { snapshotAgeDays } from "@/lib/data/snapshot-types";
import { getAllSets, getPullRates } from "@/lib/data/catalog";

/** Health check: snapshot freshness, dataset sizes, env wiring (no secrets). */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Real Blob round-trip (put → del). Distinguishes an ACTIVE store from a SUSPENDED one
 *  (the failure that silently broke the bot's approve→publish flow). Only on ?deep=1. */
async function probeBlob(): Promise<{ status: string; detail?: string }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { status: "no-token" };
  try {
    const { put, del } = await import("@vercel/blob");
    const path = `ig-health/probe-${Date.now()}.txt`;
    const { url } = await put(path, "ok", {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "text/plain",
    });
    await del(url).catch(() => {});
    return { status: "active" };
  } catch (e) {
    const msg = String(e);
    const status = /suspended/i.test(msg) ? "suspended" : "error";
    return { status, detail: msg.slice(0, 200) };
  }
}

export async function GET(req: NextRequest) {
  const snapshot = await getSnapshot();
  const evSets = Object.values(snapshot.sets).filter((s) => s.ev !== null).length;
  const ageDays = snapshotAgeDays(snapshot);

  const deep = req.nextUrl.searchParams.get("deep") === "1";
  const blobProbe = deep ? await probeBlob() : undefined;

  return NextResponse.json({
    ok: true,
    snapshot: {
      generatedAt: snapshot.generatedAt,
      ageDays: Math.round(ageDays * 10) / 10,
      stale: ageDays > 7,
      demo: snapshot.demo,
      sets: Object.keys(snapshot.sets).length,
      evSets,
      fx: snapshot.fx,
    },
    datasets: {
      catalogSets: getAllSets().length,
      pullRateSets: getPullRates().size,
    },
    env: {
      rapidApiKey: Boolean(process.env.RAPIDAPI_KEY),
      blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      cronSecret: Boolean(process.env.CRON_SECRET),
    },
    ...(blobProbe ? { blobStore: blobProbe } : {}),
  });
}
