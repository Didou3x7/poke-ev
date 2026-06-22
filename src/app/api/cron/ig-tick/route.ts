// RELIABLE scheduler for the Instagram bot. GitHub Actions' own cron is best-effort and
// silently drops scheduled runs (it skipped the ENTIRE morning window on 2026-06-22, so no
// preview was sent). Vercel Cron, by contrast, fires reliably — so we let Vercel be the
// clock and have it trigger the GitHub workflow (where the heavy Python bot runs) via
// workflow_dispatch. The bot still routes by Paris time + idempotency, so frequent ticks
// are safe (no double preview / double post).
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
      body: JSON.stringify({ ref: "main", inputs: { mode: "scheduled" } }),
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
