// RELIABLE evening-publish trigger for the Instagram bot. GitHub Actions' own `schedule` cron
// is best-effort and silently drops runs (it skipped the ENTIRE morning AND evening windows on
// 2026-06-22 — "20h et pas posté"). Vercel Cron fires reliably, so it's the clock: this fires
// at a FIXED 17:00 UTC and dispatches `mode=evening`, which WAITS for the 20:00 Paris window
// then publishes. 17:00 (not 18:00) is deliberate: Vercel Hobby crons fire only "within the
// hour", so a 17:00 slot lands at 19:00-20:00 Paris (summer) / 18:00-19:00 (winter) — ALWAYS
// before 20:00 — and the bot's wait-loop then posts precisely at 20:00 in both seasons. (An
// 18:00 slot landed at 20:00-21:00 Paris in summer, AFTER the window, so it posted late/never.)
// The morning preview
// is triggered the same way from /api/cron/refresh-snapshot (Hobby allows only 2 daily crons).
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const REPO = "Didou3x7/poke-ev";
const WORKFLOW = "instagram-bot.yml";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set, so a
  // random caller can't spin up bot runs. (Set CRON_SECRET in the Vercel project env.)
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "GH_DISPATCH_TOKEN not set" }, { status: 500 });
  }
  const r = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
        "user-agent": "pokeev-cron",
      },
      body: JSON.stringify({ ref: "main", inputs: { mode: "evening" } }),
    },
  );
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, status: r.status, error: (await r.text()).slice(0, 300) },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, dispatched: "scheduled" });
}
