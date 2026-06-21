// Read/write a JSON blob at a FIXED pathname — the shared approval state the Telegram
// webhook (Next.js app) and this Python bot (GitHub Actions) both use. A Telegram webhook
// disables getUpdates, so the bot can't poll for decisions anymore; it reads them here.
//
// Usage:
//   node blob_state.mjs get <pathname>          -> prints the JSON (empty if missing)
//   node blob_state.mjs put <pathname> <file>   -> uploads <file> as the blob, prints url
//
// Freshness: every put yields a new uploadedAt; we cache-bust the read with it so an
// overwritten blob is never served stale from the CDN. list() (metadata) is consistent.
import { list, put } from "@vercel/blob";
import { readFileSync } from "node:fs";

const [op, pathname, file] = process.argv.slice(2);
const token = process.env.BLOB_READ_WRITE_TOKEN;

if (op === "get") {
  const { blobs } = await list({ prefix: pathname, token });
  const b = blobs.find((x) => x.pathname === pathname);
  if (!b) {
    process.stdout.write("");
    process.exit(0);
  }
  const bust = new Date(b.uploadedAt).getTime();
  const r = await fetch(`${b.url}?v=${bust}`, { cache: "no-store" });
  process.stdout.write(r.ok ? await r.text() : "");
} else if (op === "put") {
  const blob = await put(pathname, readFileSync(file), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token,
  });
  process.stdout.write(blob.url);
} else {
  process.stderr.write("usage: blob_state.mjs get|put <pathname> [file]\n");
  process.exit(1);
}
