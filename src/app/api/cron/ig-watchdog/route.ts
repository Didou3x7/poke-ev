// EVENING WATCHDOG — the definitive self-heal for "the bot didn't publish at 20:00".
//
// The primary evening path (ig-tick → Python `mode=evening`) can still miss: a GitHub Actions
// run can be dropped, time out, or hit a transient Graph/Blob error. This Vercel-Pro cron runs
// FREQUENTLY in the evening window and publishes today's carousel DIRECTLY (same TS publish the
// webhook uses) the moment it sees "approved but not yet published" — so a missed primary tick
// self-corrects within ~30 min instead of becoming a silent no-post.
//
// Safe by construction:
//  - Owner rule: never before 20:00 Paris — gated on parisHour() >= 20.
//  - Idempotent: optimistically marks `published` BEFORE posting; every path (webhook, Python,
//    this watchdog) reads that guard, so it can't double-post.
//  - Only acts on decision === "approve" for TODAY with a built plan for today.
//
// Pro unlocks this: Hobby caps at 2 daily crons fired "within the hour"; Pro runs many crons
// on time, so a 30-min evening sweep is possible.
import { NextRequest, NextResponse } from "next/server";

import { publishCarousel } from "@/lib/ig/publish";
import { readPlan, readState, writeState } from "@/lib/ig/state";
import { sendMessage } from "@/lib/ig/telegram";

export const runtime = "nodejs";
export const maxDuration = 300; // a carousel publish takes ~40s
export const dynamic = "force-dynamic";

const PUBLISH_FROM_HOUR = 20; // Paris — never post before 20:00 (owner rule)

function parisHour(): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  return parseInt(h, 10) % 24;
}

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const hour = parisHour();
  if (hour < PUBLISH_FROM_HOUR) {
    return NextResponse.json({ ok: true, skipped: "before 20:00 Paris", parisHour: hour });
  }

  const today = utcDate();
  const state = await readState();
  if (!state || state.date !== today) {
    return NextResponse.json({ ok: true, skipped: "no state for today" });
  }
  if (state.published) {
    return NextResponse.json({ ok: true, skipped: "already published" });
  }
  if (state.decision !== "approve") {
    return NextResponse.json({ ok: true, skipped: `decision=${state.decision}` });
  }

  const plan = await readPlan();
  if (!plan || plan.date !== today || !plan.slides?.length) {
    return NextResponse.json({ ok: true, skipped: "no built plan for today" });
  }

  const chatId = process.env.TELEGRAM_CHAT_ID || "";

  // Optimistically guard against a concurrent primary-path publish / a second watchdog tick.
  await writeState({ ...state, published: true, ts: new Date().toISOString() });
  try {
    const { permalink } = await publishCarousel(plan.slides, plan.caption);
    if (chatId) {
      await sendMessage(
        chatId,
        "✅ Published (watchdog caught a missed evening tick)." + (permalink ? "\n" + permalink : ""),
      );
    }
    return NextResponse.json({ ok: true, published: true, permalink });
  } catch (e) {
    // Roll back so the next tick (or a tap) retries.
    await writeState({ ...state, published: false, ts: new Date().toISOString() });
    if (chatId) {
      await sendMessage(
        chatId,
        "⚠️ Watchdog tried to publish but Instagram refused:\n" +
          String(e).slice(0, 300) +
          "\nApproval KEPT — the next tick retries.",
      );
    }
    return NextResponse.json({ ok: false, error: String(e).slice(0, 300) }, { status: 502 });
  }
}
