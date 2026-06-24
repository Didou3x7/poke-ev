// Upload a local file to Vercel Blob (public) and print its URL.
// Usage: node blob_upload.mjs <file> <pathname>            (BLOB_READ_WRITE_TOKEN in env)
//    or: node blob_upload.mjs --exists <pathname>          (prints the URL iff it already exists)
import { put, list } from "@vercel/blob";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);

if (args[0] === "--exists") {
  // Credit-saver: report whether an upscaled asset is already hosted (deterministic pathname),
  // so the bot can skip a duplicate Real-ESRGAN (Replicate) spend and reuse the cached image.
  const pathname = args[1];
  const { blobs } = await list({ prefix: pathname, limit: 1, token: process.env.BLOB_READ_WRITE_TOKEN });
  const hit = (blobs || []).find((b) => b.pathname === pathname);
  if (hit) console.log(hit.url);
  process.exit(0);
}

const [file, pathname] = args;
const blob = await put(pathname, readFileSync(file), {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: "image/png",
  token: process.env.BLOB_READ_WRITE_TOKEN,
});
console.log(blob.url);
