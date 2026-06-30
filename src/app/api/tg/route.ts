// Telegram WEBHOOK for the @pokeev.tcg bot. Telegram pushes button taps / replies here
// the instant they happen, so the editor gets IMMEDIATE feedback (the inline-button spinner
// stops at once) and the whole approve → publish flow lives ENTIRELY in Telegram — no need
// to come back to the chat. The decision is recorded in shared Blob state that the Python
// cron (GitHub Actions) reads; in the evening the webhook also publishes directly.
//
// Security: Telegram is told a secret token at setWebhook time and echoes it in the
// `x-telegram-bot-api-secret-token` header on every call — we reject anything else.
import { NextRequest, NextResponse } from "next/server";

import { publishCarousel } from "@/lib/ig/publish";
import {
  readPlan,
  readState,
  writeState,
  type Decision,
  type IgState,
  type MediaFormat,
} from "@/lib/ig/state";
import { answerCallback, deliverReel, sendMessage, setDecisionLabel } from "@/lib/ig/telegram";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Pro — a carousel publish takes ~40s

const PUBLISH_FROM_HOUR = 20; // Paris — never post before 20:00 (owner rule)

/** Kick the Python bot (GitHub Actions) NOW so a revise note is reworked within ~1 min,
 *  instead of waiting for an unreliable cron tick. The webhook only RECORDS the note (the
 *  rework = Claude rebuild + Satori render = Python). Best-effort; the cron is the fallback. */
async function dispatchBot(mode: string): Promise<void> {
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) return;
  try {
    await fetch(
      "https://api.github.com/repos/Didou3x7/poke-ev/actions/workflows/instagram-bot.yml/dispatches",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          "content-type": "application/json",
          "user-agent": "pokeev-tg",
        },
        body: JSON.stringify({ ref: "main", inputs: { mode } }),
      },
    );
  } catch {
    /* the next cron tick reworks it anyway */
  }
}

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

function nowIso(): string {
  return new Date().toISOString();
}

function freshState(prev: IgState | null): IgState {
  const today = utcDate();
  if (prev && prev.date === today) return { ...prev };
  return {
    date: today,
    decision: "none",
    note: null,
    seq: 0,
    published: false,
    awaiting_revise: false,
    format: "carousel",
    format_seq: 0,
    ts: nowIso(),
  };
}

const CREATIVE_HINT =
  /\b(change|swap|make|bigger|smaller|move|fix|replace|remove|add|color|colour|price|caption|titl|text|zoom|crop|slide|font|spac|align|wrong|instead|plutot|plutôt|change|enlev|remplace|corrig|agrand|deplace|déplace)/i;

function classifyText(text: string): { decision: Decision; note: string | null } {
  const low = text.trim().toLowerCase();
  if (["skip", "cancel", "stop", "no", "non"].includes(low)) return { decision: "skip", note: null };
  if (["ok", "okay", "approve", "yes", "go", "post", "oui", "✅"].includes(low))
    return { decision: "approve", note: null };
  // Otherwise treat a substantive message as revise notes.
  if (text.trim().length > 1 && CREATIVE_HINT.test(text)) return { decision: "revise", note: text.trim() };
  return { decision: "none", note: null }; // chatter / questions are not decisions
}

/** Publish today's carousel right now (evening path). Optimistically marks published to
 *  guard against a double tap / Telegram retry; rolls back + alerts on failure so a later
 *  cron tick or tap retries. */
async function publishNow(chatId: string, state: IgState): Promise<void> {
  const plan = await readPlan();
  if (!plan || plan.date !== state.date) {
    await sendMessage(chatId, "⚠️ Approved, but I can't find today's built post to publish. The 20:00 cron will handle it.");
    return;
  }
  const wantReel = state.format === "reel";
  const planIsReel = plan.format === "reel" && !!plan.video_url;
  // The editor chose 🎬 Reels but the bot hasn't finished rendering/hosting it yet — DON'T
  // fall back to publishing the carousel (that would post the wrong format). Wait for the reel.
  if (wantReel && !planIsReel) {
    await sendMessage(chatId, "🎬 The Reel is still rendering — I'll post the preview here in a moment, then tap ✅ Approve.");
    return;
  }
  if (!planIsReel && !plan.slides?.length) {
    await sendMessage(chatId, "⚠️ Approved, but today's post has no media to publish. The 20:00 cron will handle it.");
    return;
  }
  await writeState({ ...state, decision: "approve", published: true, ts: nowIso() });
  if (planIsReel) {
    // The bot does NOT auto-publish Reels: Instagram's API can't attach native TRENDING audio
    // (licensing — app-only) and a silent auto-post forfeits the audio boost. DELIVER it for
    // MANUAL in-app posting instead — and EVERYTHING stays inside Telegram: the saveable video
    // is re-sent as a native upload (no external link to chase) + the caption to copy/paste.
    await sendMessage(
      chatId,
      "🎬 Reel prêt — à poster DANS l'app Instagram pour le son TENDANCE (l'API ne peut pas " +
        "ajouter l'audio tendance natif d'Instagram) :\n" +
        "1️⃣ Enregistre le FICHIER 📎 ci-dessous (qualité source max, jamais recompressé).\n" +
        "2️⃣ Instagram → nouveau Reel → choisis la vidéo.\n" +
        "3️⃣ 🎵 Audio → un son TENDANCE (ceux avec la flèche ↗).\n" +
        "4️⃣ Colle la caption ↓ → Partager.\n\n" +
        "ℹ️ L'aperçu vidéo = pour regarder. Le FICHIER 📎 = qualité 100% identique à une publication directe.",
    );
    const videoUrl = plan.video_url as string; // planIsReel guarantees it's set
    const sent = await deliverReel(chatId, videoUrl, "🎬 Reel — fichier source, qualité max");
    if (!sent) await sendMessage(chatId, "⚠️ Upload direct impossible — lien : " + videoUrl);
    await sendMessage(chatId, "— CAPTION (copie/colle) —");
    await sendMessage(chatId, plan.caption || "(no caption)");
    return;
  }
  await sendMessage(chatId, "📤 Approved — publishing now…");
  try {
    const { permalink } = await publishCarousel(plan.slides, plan.caption);
    await sendMessage(
      chatId,
      "✅ Published!" + (permalink ? "\n" + permalink : "") + "\n\n(open it to add to your story manually)",
    );
  } catch (e) {
    await writeState({ ...state, decision: "approve", published: false, ts: nowIso() });
    await sendMessage(
      chatId,
      "⚠️ Couldn't publish — Instagram refused the post:\n" +
        String(e).slice(0, 400) +
        "\n\nYour approval is KEPT — the cron retries automatically.",
    );
  }
}

async function handleApprove(chatId: string, messageId: number | null): Promise<void> {
  const state = freshState(await readState());
  if (state.published) {
    await sendMessage(chatId, "✅ Today's carousel is already published — nothing more to do.");
    return;
  }
  if (messageId) await setDecisionLabel(chatId, messageId, "✅ Approved");
  if (parisHour() >= PUBLISH_FROM_HOUR) {
    await publishNow(chatId, state);
  } else {
    await writeState({ ...state, decision: "approve", awaiting_revise: false, ts: nowIso() });
    await sendMessage(chatId, "✅ Approved — publishing automatically at 20:00. Nothing else to do.");
  }
}

async function handleSkip(chatId: string, messageId: number | null): Promise<void> {
  const state = freshState(await readState());
  if (messageId) await setDecisionLabel(chatId, messageId, "🚫 Skipped");
  await writeState({ ...state, decision: "skip", awaiting_revise: false, ts: nowIso() });
  await sendMessage(chatId, "🚫 Skipped — nothing will be posted today.");
}

async function handleReviseTap(chatId: string, messageId: number | null): Promise<void> {
  const state = freshState(await readState());
  if (messageId) await setDecisionLabel(chatId, messageId, "✏️ Revising");
  await writeState({ ...state, awaiting_revise: true, ts: nowIso() });
  await sendMessage(chatId, "✏️ What should I change? Reply with the notes and I'll rework it.");
}

/** 🎬 Reels / 🖼 Carousel toggle. The webhook only RECORDS the chosen format + bumps format_seq;
 *  the Python bot (which has Remotion) renders the Reel and re-previews. Resets the decision to
 *  "none" so the editor re-approves the new version. */
async function handleFormatTap(
  chatId: string,
  messageId: number | null,
  fmt: MediaFormat,
): Promise<void> {
  const state = freshState(await readState());
  if (state.published) {
    await sendMessage(chatId, "✅ Today's post is already published — nothing more to do.");
    return;
  }
  if (messageId) await setDecisionLabel(chatId, messageId, fmt === "reel" ? "🎬 Reels" : "🖼 Carousel");
  await writeState({
    ...state,
    format: fmt,
    format_seq: (state.format_seq ?? 0) + 1,
    decision: "none",
    awaiting_revise: false,
    ts: nowIso(),
  });
  await dispatchBot("poll");
  await sendMessage(
    chatId,
    fmt === "reel"
      ? "🎬 Rendering this post as a vertical Reel — a fresh preview lands here in ~2-3 min."
      : "🖼 Switching back to the carousel — a fresh preview lands here shortly.",
  );
}

async function handleReviseNote(chatId: string, note: string): Promise<void> {
  const state = freshState(await readState());
  await writeState({
    ...state,
    decision: "revise",
    note,
    seq: state.seq + 1,
    awaiting_revise: false,
    ts: nowIso(),
  });
  // Trigger the rework immediately (don't wait for a cron tick — that was the gap: the note
  // was recorded but never reworked until a Python run happened to fire).
  await dispatchBot("poll");
  await sendMessage(chatId, "🔄 Got it — reworking with your notes now, a fresh preview lands in ~1 min.");
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const chatId = process.env.TELEGRAM_CHAT_ID || "";

  let update: {
    callback_query?: { id: string; data?: string; message?: { message_id: number; chat: { id: number } } };
    message?: { text?: string; chat: { id: number } };
  };
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // ignore malformed; never make Telegram retry
  }

  try {
    const cq = update.callback_query;
    if (cq && String(cq.message?.chat.id ?? "") === chatId) {
      await answerCallback(cq.id, "Got it ✓");
      const mid = cq.message?.message_id ?? null;
      if (cq.data === "approve") await handleApprove(chatId, mid);
      else if (cq.data === "skip" || cq.data === "reject") await handleSkip(chatId, mid);
      else if (cq.data === "revise") await handleReviseTap(chatId, mid);
      else if (cq.data === "reel") await handleFormatTap(chatId, mid, "reel");
      else if (cq.data === "carousel") await handleFormatTap(chatId, mid, "carousel");
      return NextResponse.json({ ok: true });
    }

    const msg = update.message;
    if (msg?.text && String(msg.chat.id) === chatId) {
      const text = msg.text.trim();
      if (text.startsWith("/")) return NextResponse.json({ ok: true }); // ignore commands
      const state = freshState(await readState());
      if (state.awaiting_revise) {
        await handleReviseNote(chatId, text);
        return NextResponse.json({ ok: true });
      }
      const { decision, note } = classifyText(text);
      if (decision === "approve") await handleApprove(chatId, null);
      else if (decision === "skip") await handleSkip(chatId, null);
      else if (decision === "revise" && note) await handleReviseNote(chatId, note);
      // "none" (chatter / a question) is intentionally ignored — never drops an approval
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    // Never make Telegram retry on our own bug; surface it to the editor instead.
    const msg = String(e);
    if (/suspended/i.test(msg)) {
      await sendMessage(
        chatId,
        "⚠️ Le store Vercel Blob est SUSPENDU — le bot ne peut ni enregistrer ta décision ni publier.\n" +
          "→ Vercel → Storage → réactive le store (Resume), puis re-tape ton bouton.",
      );
    } else {
      await sendMessage(chatId, "⚠️ Webhook error handling your tap: " + msg.slice(0, 300));
    }
  }
  return NextResponse.json({ ok: true });
}

// A GET is handy to sanity-check the route is deployed (returns 200, no secrets).
export function GET(): NextResponse {
  return NextResponse.json({ ok: true, service: "tg-webhook" });
}
