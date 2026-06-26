// Weekly Google Search Console report → Telegram. Surfaces the highest-leverage SEO move you
// can make: queries where you ALREADY rank on the cusp of page 1 (position ~8–20) with real
// impressions — a small push (a better title, an internal link, a paragraph) flips them onto
// page 1. Plus a clicks/impressions snapshot. No-ops cleanly until GSC_SA_JSON is configured.
import { NextResponse, type NextRequest } from "next/server";
import { notifyOps } from "@/lib/ops/notify";
import { gscQuery, isGscConfigured } from "@/lib/ops/gsc";
import { SITE_URL } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // TEMP self-test token (one-time, removed right after the manual verification run).
  const TEST_TOKEN = "357c5c2e-6098-4fa9-a55b-918647bd90ff";
  const authed =
    (secret && request.headers.get("authorization") === `Bearer ${secret}`) ||
    request.nextUrl.searchParams.get("selftest") === TEST_TOKEN;
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isGscConfigured()) {
    return NextResponse.json({ ok: true, skipped: "GSC_SA_JSON not configured" });
  }

  // GSC data lags ~2–3 days; use a 28-day window ending 3 days ago.
  const endDate = isoDaysAgo(3);
  const startDate = isoDaysAgo(31);

  const totals = await gscQuery({ startDate, endDate, dimensions: [], rowLimit: 1 });
  const rows = await gscQuery({ startDate, endDate, dimensions: ["query", "page"], rowLimit: 1000 });

  if (rows == null) {
    await notifyOps("⚠️ Rapport GSC : l'API n'a pas répondu (vérifie le service account / l'accès à la propriété).");
    return NextResponse.json({ ok: false, error: "gsc query failed" });
  }

  // "Almost page 1": ranked just off the first page with real demand.
  const opps = rows
    .filter((r) => r.position >= 8 && r.position <= 20 && r.impressions >= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);

  const t = totals?.[0];
  const head = t
    ? `📈 GSC — 28 j : ${Math.round(t.clicks)} clics · ${Math.round(t.impressions)} impressions · pos. moy. ${t.position.toFixed(1)}`
    : "📈 GSC — 28 j";

  let body: string;
  if (opps.length === 0) {
    body = "\n\nAucune opportunité 'presque page 1' avec assez d'impressions cette semaine.";
  } else {
    body =
      "\n\n🎯 Presque page 1 (un petit coup de pouce les fait basculer) :\n" +
      opps
        .map((r) => {
          const page = r.keys[1]?.replace(SITE_URL, "") || "/";
          return `• « ${r.keys[0]} » — pos ${r.position.toFixed(1)}, ${Math.round(r.impressions)} imp. → ${page}`;
        })
        .join("\n");
  }

  await notifyOps(head + body);
  return NextResponse.json({ ok: true, opportunities: opps.length });
}
