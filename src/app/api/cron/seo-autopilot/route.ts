// Weekly SEO autopilot (white-hat) — reads Google Search Console, finds the pages ranking just
// off page 1, and ALIGNS the site to that proven demand automatically: (1) records each page's
// real search query so the page can flow internal links + weave the query into its meta
// description, (2) forces a recrawl (revalidate + IndexNow) so Google re-reads the tuned pages.
// It NEVER fabricates content (that's the spammy path Google penalizes) — it points existing,
// already-relevant pages at the exact demand. Reports what it tuned to Telegram.
import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { gscQuery, isGscConfigured } from "@/lib/ops/gsc";
import { writeSeoTargets, toPath, type SeoTarget } from "@/lib/ops/seo-targets";
import { pingIndexNow } from "@/lib/ops/indexnow";
import { notifyOps } from "@/lib/ops/notify";
import { SITE_URL } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const MAX_PAGES = 20; // tune the top-N opportunity pages per week

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isGscConfigured()) {
    return NextResponse.json({ ok: true, skipped: "GSC not configured" });
  }

  const rows = await gscQuery({
    startDate: isoDaysAgo(31),
    endDate: isoDaysAgo(3),
    dimensions: ["page", "query"], // keys = [page, query]
    rowLimit: 2000,
  });
  if (rows == null) {
    return NextResponse.json({ ok: false, error: "gsc query failed" });
  }

  // Almost-page-1, with real demand. Keep the single best query per page.
  const bestByPath = new Map<string, SeoTarget>();
  for (const r of rows) {
    if (r.position < 5 || r.position > 20 || r.impressions < 10) continue;
    const url = r.keys[0];
    const query = r.keys[1];
    if (!url || !query) continue;
    const path = toPath(url);
    const cur = bestByPath.get(path);
    if (!cur || r.impressions > cur.impressions) {
      bestByPath.set(path, { url, path, query, position: r.position, impressions: r.impressions });
    }
  }

  const items = [...bestByPath.values()].sort((a, b) => b.impressions - a.impressions).slice(0, MAX_PAGES);
  const generatedAt = new Date().toISOString();
  await writeSeoTargets({ generatedAt, items });

  // Re-tune & recrawl: the metadata + popular-searches module pick up the new targets on
  // revalidation; IndexNow tells Google to re-read them now.
  for (const it of items) revalidatePath(it.path);
  for (const p of ["/", "/en", "/tendances", "/en/trends"]) revalidatePath(p);
  await pingIndexNow([
    ...items.map((i) => i.url),
    `${SITE_URL}/`,
    `${SITE_URL}/en`,
    `${SITE_URL}/tendances`,
  ]);

  if (items.length > 0) {
    const top = items.slice(0, 8).map((i) => `• « ${i.query} » pos ${i.position.toFixed(1)} (${Math.round(i.impressions)} imp.) → ${i.path}`);
    await notifyOps(
      `🤖 SEO autopilot — ${items.length} page(s) optimisée(s) cette semaine (titres alignés sur la requête + maillage + recrawl) :\n${top.join("\n")}`,
    );
  } else {
    await notifyOps("🤖 SEO autopilot : aucune page 'presque page 1' avec assez de demande cette semaine (propriété encore jeune).");
  }

  return NextResponse.json({ ok: true, tuned: items.length });
}
