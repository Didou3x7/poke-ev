// SEO autopilot state — the weekly "page → real search query" map distilled from Google Search
// Console. The autopilot cron writes it; pages READ it to (a) flow internal links to the
// almost-page-1 pages with the real query as anchor text, and (b) weave that query into their
// meta description. 100% white-hat: it ALIGNS existing pages to proven demand, never fabricates
// content. Cached in-memory per instance so the ~9k pages don't each hit Blob.
import { SITE_URL } from "@/lib/i18n/config";

export interface SeoTarget {
  url: string; // full URL as GSC reports it
  path: string; // pathname only (for matching in metadata)
  query: string; // the exact search query people use
  position: number;
  impressions: number;
}

export interface SeoTargets {
  generatedAt: string;
  items: SeoTarget[];
}

export const EMPTY_TARGETS: SeoTargets = { generatedAt: "1970-01-01T00:00:00.000Z", items: [] };

const TARGETS_PATH = "seo/query-targets.json";

export async function writeSeoTargets(data: SeoTargets): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const { put } = await import("@vercel/blob");
    await put(TARGETS_PATH, JSON.stringify(data), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch {
    /* best-effort */
  }
}

let cache: { at: number; data: SeoTargets } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function readSeoTargets(): Promise<SeoTargets> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return EMPTY_TARGETS;
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: TARGETS_PATH, limit: 1 });
    const b = blobs.find((x) => x.pathname === TARGETS_PATH);
    if (!b) return EMPTY_TARGETS;
    const r = await fetch(`${b.url}?v=${encodeURIComponent(b.uploadedAt.toString())}`, { cache: "no-store" });
    if (!r.ok) return EMPTY_TARGETS;
    const data = (await r.json()) as SeoTargets;
    cache = { at: Date.now(), data };
    return data;
  } catch {
    return EMPTY_TARGETS;
  }
}

/** The best real search query for a given pathname (or null) — used to enrich that page's
 *  meta description with the phrasing searchers actually use. */
export async function seoQueryForPath(path: string): Promise<string | null> {
  const { items } = await readSeoTargets();
  const hit = items.find((i) => i.path === path);
  return hit?.query ?? null;
}

/** Normalize a GSC page URL to a site-relative pathname. */
export function toPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.replace(SITE_URL, "") || "/";
  }
}

/** If this page ranks just off page 1 for a real query, weave that exact query into the meta
 *  description (and OG/Twitter) — but ONLY when it's not already there, so it reads naturally and
 *  never keyword-stuffs. White-hat: it matches the page to the phrasing searchers actually use. */
export async function withSeoQuery(
  meta: import("next").Metadata,
  path: string,
  locale: "fr" | "en",
): Promise<import("next").Metadata> {
  const q = (await seoQueryForPath(path))?.trim();
  if (!q) return meta;
  const base = typeof meta.description === "string" ? meta.description : "";
  if (!base || base.toLowerCase().includes(q.toLowerCase())) return meta;
  const phrase = q.charAt(0).toUpperCase() + q.slice(1);
  const tail = locale === "fr" ? `${phrase} : prix et cote à jour.` : `${phrase}: live price & market value.`;
  const description = `${base} ${tail}`.slice(0, 320);
  return {
    ...meta,
    description,
    openGraph: meta.openGraph ? { ...meta.openGraph, description } : meta.openGraph,
    twitter: meta.twitter ? { ...meta.twitter, description } : meta.twitter,
  };
}
