// Daily SEO health crawl — keeps the ~9k-page site indexable without anyone watching. Checks
// EVERY core page (static + set pages + trends, both locales) plus a ROTATING slice of card
// pages each day (so the whole long tail is covered over ~6 weeks), and pings Telegram only when
// something's actually broken (non-200, missing title/meta/canonical, accidental noindex).
import { NextResponse, type NextRequest } from "next/server";
import { SITE_URL } from "@/lib/i18n/config";
import { notifyOps } from "@/lib/ops/notify";
import { crawlSeoHealth, sitemapUrls } from "@/lib/ops/seo-crawl";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const CARD_SLICE = 250; // card pages checked per day (rotates through the full set)

function dayOfYear(): number {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  return Math.floor((now.getTime() - start) / 86_400_000);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const all = await sitemapUrls(`${SITE_URL}/sitemap.xml`);
  if (all.length === 0) {
    await notifyOps("🚨 SEO santé : le sitemap est vide ou injoignable.");
    return NextResponse.json({ ok: false, error: "empty sitemap" });
  }

  const isCard = (u: string) => /\/(cartes|cards)\//.test(u);
  const core = all.filter((u) => !isCard(u));
  const cards = all.filter(isCard);

  // Rotating window over the card long tail.
  const start = cards.length ? (dayOfYear() * CARD_SLICE) % cards.length : 0;
  const cardSlice = cards.slice(start, start + CARD_SLICE);
  if (cardSlice.length < CARD_SLICE && cards.length > CARD_SLICE) {
    cardSlice.push(...cards.slice(0, CARD_SLICE - cardSlice.length)); // wrap around
  }

  const toCheck = [...core, ...cardSlice];
  const issues = await crawlSeoHealth(toCheck);

  if (issues.length > 0) {
    const lines = issues.slice(0, 15).map((i) => `• ${i.url.replace(SITE_URL, "")} — ${i.problems.join(", ")}`);
    const extra = issues.length > 15 ? `\n…+${issues.length - 15} autres` : "";
    await notifyOps(`🔧 SEO santé — ${issues.length} problème(s) sur ${toCheck.length} pages :\n${lines.join("\n")}${extra}`);
  }

  return NextResponse.json({
    ok: true,
    checked: toCheck.length,
    core: core.length,
    cardsChecked: cardSlice.length,
    cardsTotal: cards.length,
    issues: issues.length,
  });
}
