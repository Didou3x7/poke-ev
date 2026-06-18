// Upload a local file to Vercel Blob (public) and print its URL.
// Usage: node blob_upload.mjs <file> <pathname>   (BLOB_READ_WRITE_TOKEN in env)
import { put } from "@vercel/blob";
import { readFileSync } from "node:fs";

const [file, pathname] = process.argv.slice(2);
const blob = await put(pathname, readFileSync(file), {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: "image/png",
  token: process.env.BLOB_READ_WRITE_TOKEN,
});
console.log(blob.url);
