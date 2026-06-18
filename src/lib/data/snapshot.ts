import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EMPTY_SNAPSHOT, type Snapshot } from "./snapshot-types";

/**
 * Snapshot access for the app (server-side only).
 *
 * Resolution order:
 *   1. Vercel Blob "snapshot.json" (kept fresh by the daily cron) — only when
 *      BLOB_READ_WRITE_TOKEN is configured;
 *   2. bundled /data/snapshot/snapshot.json (committed, refreshed by
 *      `npm run snapshot`);
 *   3. EMPTY_SNAPSHOT — every page then degrades to "EV indisponible".
 *
 * The front end never calls the price API: this module is the only data door.
 */

const BUNDLED_PATH = join(process.cwd(), "data", "snapshot", "snapshot.json");
const MEMO_TTL_MS = 10 * 60 * 1000;

let memo: { snapshot: Snapshot; at: number } | null = null;

export function isSnapshot(value: unknown): value is Snapshot {
  return (
    !!value &&
    typeof value === "object" &&
    (value as Snapshot).version === 1 &&
    typeof (value as Snapshot).sets === "object"
  );
}

export function readBundledSnapshot(): Snapshot {
  try {
    const parsed = JSON.parse(readFileSync(BUNDLED_PATH, "utf8")) as unknown;
    return isSnapshot(parsed) ? parsed : EMPTY_SNAPSHOT;
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

async function fetchBlobSnapshot(): Promise<Snapshot | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: "snapshot.json", limit: 1 });
    if (!blobs[0]) return null;
    const res = await fetch(blobs[0].url, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const parsed = (await res.json()) as unknown;
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function getSnapshot(): Promise<Snapshot> {
  if (memo && Date.now() - memo.at < MEMO_TTL_MS) return memo.snapshot;
  const bundled = readBundledSnapshot();
  const blob = await fetchBlobSnapshot();
  // Prefer whichever is newer (a stale blob must not shadow a fresh commit).
  const chosen =
    blob && Date.parse(blob.generatedAt) >= Date.parse(bundled.generatedAt) ? blob : bundled;
  memo = { snapshot: chosen, at: Date.now() };
  return chosen;
}

export function getSetSnapshot(snapshot: Snapshot, setId: string) {
  return snapshot.sets[setId] ?? null;
}
