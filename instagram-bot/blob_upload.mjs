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
// Infer the content type from the extension — Instagram fetches a Reel's video_url and
// REQUIRES it served as video/mp4, while card art stays image/png. Anything else → octet.
const ext = (pathname.split(".").pop() || "").toLowerCase();
const CT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  mp4: "video/mp4",
  mov: "video/quicktime",
  json: "application/json",
};
const blob = await put(pathname, readFileSync(file), {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: CT[ext] || "application/octet-stream",
  token: process.env.BLOB_READ_WRITE_TOKEN,
});
console.log(blob.url);
