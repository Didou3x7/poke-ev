// Lightweight SEO health crawler — fetches pages and flags the issues that silently sink
// rankings: non-200 status, missing/empty <title>, missing meta description, missing canonical,
// an accidental noindex. Pure fetch + regex (no headless browser) so it runs in a cron well
// under the function limit. Reports ONLY problems — silence means the crawled slice is healthy.

export interface SeoIssue {
  url: string;
  problems: string[];
}

async function checkUrl(url: string): Promise<SeoIssue | null> {
  try {
    const r = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": "pokeev-seo-health/1.0" },
      cache: "no-store",
    });
    if (r.status >= 300) return { url, problems: [`HTTP ${r.status}`] };
    const html = await r.text();
    const problems: string[] = [];
    if (!/<title>[^<]{5,}<\/title>/i.test(html)) problems.push("title manquant/vide");
    if (!/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html))
      problems.push("meta description manquante/courte");
    if (!/<link[^>]+rel=["']canonical["']/i.test(html)) problems.push("canonical manquant");
    if (/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)) problems.push("⚠️ NOINDEX");
    return problems.length ? { url, problems } : null;
  } catch (e) {
    return { url, problems: [`fetch failed: ${String(e).slice(0, 60)}`] };
  }
}

/** Run `fn` over items with a fixed concurrency (keeps the cron under the time/socket limit). */
async function pool<T, R>(items: T[], concurrency: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function crawlSeoHealth(urls: string[], concurrency = 12): Promise<SeoIssue[]> {
  const res = await pool(urls, concurrency, checkUrl);
  return res.filter((x): x is SeoIssue => x != null);
}

/** Pull every <loc> out of the sitemap (and any nested sitemaps). */
export async function sitemapUrls(sitemapUrl: string): Promise<string[]> {
  try {
    const r = await fetch(sitemapUrl, { cache: "no-store" });
    if (!r.ok) return [];
    const xml = await r.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
    // If it's a sitemap index, recurse one level into child sitemaps.
    if (/<sitemapindex/i.test(xml)) {
      const nested = await Promise.all(locs.map((u) => sitemapUrls(u)));
      return [...new Set(nested.flat())];
    }
    return [...new Set(locs)];
  } catch {
    return [];
  }
}
