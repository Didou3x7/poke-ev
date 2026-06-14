import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/data/snapshot";
import { snapshotAgeDays } from "@/lib/data/snapshot-types";
import { getAllSets, getPullRates } from "@/lib/data/catalog";

/** Health check: snapshot freshness, dataset sizes, env wiring (no secrets). */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getSnapshot();
  const evSets = Object.values(snapshot.sets).filter((s) => s.ev !== null).length;
  const ageDays = snapshotAgeDays(snapshot);

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
  });
}
