// Hourly health watchdog — hits our own /api/health?deep=1 and pings the owner on Telegram the
// MOMENT something breaks (Blob suspended, snapshot gone stale, site not 200), instead of the
// owner discovering it by tapping Approve on a post that won't publish. Throttled to one alert
// per problem per 6h so a sustained outage doesn't spam — but if Blob itself is the problem the
// throttle store is unreadable, so it errs toward alerting (exactly when you want repeated nudges).
import { NextResponse, type NextRequest } from "next/server";
import { SITE_URL } from "@/lib/i18n/config";
import { notifyOps } from "@/lib/ops/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THROTTLE_MS = 6 * 60 * 60 * 1000;
const MARKER = "ops/health-alert.json";

async function lastAlert(): Promise<{ status: string; ts: number } | null> {
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: MARKER, limit: 1 });
    const b = blobs.find((x) => x.pathname === MARKER);
    if (!b) return null;
    const r = await fetch(`${b.url}?v=${encodeURIComponent(b.uploadedAt.toString())}`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as { status: string; ts: number }) : null;
  } catch {
    return null; // Blob unreadable (maybe it's the outage) → don't throttle
  }
}

async function recordAlert(status: string, ts: number): Promise<void> {
  try {
    const { put } = await import("@vercel/blob");
    await put(MARKER, JSON.stringify({ status, ts }), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch {
    /* best-effort */
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let problem: string | null = null;
  let detail = "";
  try {
    const r = await fetch(`${SITE_URL}/api/health?deep=1`, { cache: "no-store" });
    if (!r.ok) {
      problem = "site-down";
      detail = `/api/health → HTTP ${r.status}`;
    } else {
      const h = (await r.json()) as {
        snapshot?: { stale?: boolean; ageDays?: number };
        blobStore?: { status?: string; detail?: string };
      };
      if (h.blobStore && h.blobStore.status !== "active") {
        problem = `blob-${h.blobStore.status}`;
        detail = h.blobStore.status === "suspended"
          ? "Le store Vercel Blob est SUSPENDU → Vercel → Storage → Resume. Le bot ne peut pas publier."
          : `Blob store: ${h.blobStore.status} (${h.blobStore.detail ?? ""})`;
      } else if (h.snapshot?.stale) {
        problem = "snapshot-stale";
        detail = `Le snapshot a ${h.snapshot.ageDays}j — le refresh quotidien ne tourne plus.`;
      }
    }
  } catch (e) {
    problem = "health-unreachable";
    detail = String(e).slice(0, 150);
  }

  if (!problem) return NextResponse.json({ ok: true, healthy: true });

  const prev = await lastAlert();
  const now = Date.now();
  if (prev && prev.status === problem && now - prev.ts < THROTTLE_MS) {
    return NextResponse.json({ ok: true, problem, throttled: true });
  }
  await notifyOps(`🚨 ALERTE santé pokeev.com — ${problem}\n${detail}`);
  await recordAlert(problem, now);
  return NextResponse.json({ ok: true, problem, alerted: true });
}
