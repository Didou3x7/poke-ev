// Shared approval state + publishable plan for the Instagram bot, stored on Vercel Blob
// so the Telegram WEBHOOK (this Next.js app) and the PYTHON cron (GitHub Actions) read and
// write the SAME source of truth. This replaces the old getUpdates polling: a Telegram
// webhook disables getUpdates, so the bot can no longer poll — the decision is recorded
// here by the webhook the instant the editor taps a button, and the cron reads it.
//
// Freshness: a Blob public URL is CDN-cached, but every `put` returns a new `uploadedAt`,
// so we cache-bust reads with `?v=<uploadedAt>` — the URL changes on every write, forcing
// a CDN miss and a fresh read. `list({prefix})` (the metadata API) is strongly consistent.
import { list, put } from "@vercel/blob";

const STATE_PATH = "ig-state/state.json";
const PLAN_PATH = "ig-state/plan.json";

export type Decision = "none" | "approve" | "skip" | "revise";

export type MediaFormat = "carousel" | "reel";

export interface IgState {
  date: string; // UTC date this state is for (ties the decision to today's preview)
  decision: Decision; // the editor's latest intent
  note: string | null; // revise notes (when decision === "revise")
  seq: number; // bumped on each new revise note so the cron only reworks NEW notes
  published: boolean; // true once the carousel is live (idempotency guard)
  awaiting_revise: boolean; // true after a ✏️ Revise tap, until the editor sends the notes
  format?: MediaFormat; // which format today's post publishes as (default carousel)
  format_seq?: number; // bumped on each 🎬/🖼 toggle so the Python cron only rebuilds NEW toggles
  ts: string; // last-write timestamp (debug)
}

/** Minimal plan the webhook needs to publish directly in the evening. A reel plan also carries
 *  the Blob-hosted video_url (+ optional cover_url) so the webhook can publish it without Remotion. */
export interface IgPlan {
  date: string;
  theme: string;
  slides: string[]; // Blob-hosted PNG URLs, directly fetchable by Instagram
  caption: string;
  format?: MediaFormat;
  video_url?: string | null; // the rendered MP4 (when format === "reel")
  cover_url?: string | null; // the reel cover/thumbnail
}

function token(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

async function readJson<T>(pathname: string): Promise<T | null> {
  try {
    const { blobs } = await list({ prefix: pathname, token: token() });
    const b = blobs.find((x) => x.pathname === pathname);
    if (!b) return null;
    const r = await fetch(`${b.url}?v=${encodeURIComponent(b.uploadedAt.toString())}`, {
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

async function writeJson(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token: token(),
  });
}

export function readState(): Promise<IgState | null> {
  return readJson<IgState>(STATE_PATH);
}

export function writeState(state: IgState): Promise<void> {
  return writeJson(STATE_PATH, state);
}

export function readPlan(): Promise<IgPlan | null> {
  return readJson<IgPlan>(PLAN_PATH);
}
