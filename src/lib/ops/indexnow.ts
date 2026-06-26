// IndexNow — instantly tell Bing/Yandex/Seznam (and, increasingly, signals Google) that
// URLs changed, so they recrawl in minutes instead of waiting for the next organic crawl.
// The key is PUBLIC (hosted at /<KEY>.txt) — IndexNow verifies ownership by fetching it.
// Best-effort: a ping failure must never fail the calling cron.
import { SITE_URL } from "@/lib/i18n/config";

// Matches the file committed at public/<KEY>.txt — NOT a secret (ownership proof only).
const KEY = "c6a01191e91143fdaf86f9159a9db681";

export async function pingIndexNow(urls: string[]): Promise<{ ok: boolean; count: number; status?: number }> {
  const list = [...new Set(urls)].filter(Boolean).slice(0, 10000); // IndexNow caps at 10k/req
  if (list.length === 0) return { ok: true, count: 0 };
  try {
    const host = new URL(SITE_URL).host;
    const r = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: KEY,
        keyLocation: `${SITE_URL}/${KEY}.txt`,
        urlList: list,
      }),
    });
    return { ok: r.ok, count: list.length, status: r.status };
  } catch {
    return { ok: false, count: list.length };
  }
}
