// Google Search Console API client — service-account auth (JWT → OAuth token) with NO extra
// dependency (Node crypto signs the RS256 JWT). Reads search analytics so a weekly cron can
// surface "almost page 1" opportunities. Returns null on any missing-config / error (the cron
// then just skips). Set GSC_SA_JSON (the service-account key JSON, as a single env string) and
// optionally GSC_SITE_URL (defaults to https://pokeev.com/; use "sc-domain:pokeev.com" for a
// Domain property).
import { createSign } from "node:crypto";

const b64url = (s: string | Buffer): string =>
  (typeof s === "string" ? Buffer.from(s) : s).toString("base64url");

async function getAccessToken(saJson: string): Promise<string | null> {
  try {
    const sa = JSON.parse(saJson) as { client_email: string; private_key: string };
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = b64url(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/webmasters.readonly",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    );
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${claim}`);
    const jwt = `${header}.${claim}.${b64url(signer.sign(sa.private_key))}`;
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    if (!r.ok) return null;
    return ((await r.json()) as { access_token?: string }).access_token ?? null;
  } catch {
    return null;
  }
}

/** Which GSC property to query. Honours GSC_SITE_URL if set, else auto-detects the property the
 *  service account can see (preferring a Domain property `sc-domain:pokeev.com`). So it works
 *  whether the owner verified a Domain or a URL-prefix property — no env var needed. */
async function resolveSiteUrl(token: string): Promise<string | null> {
  const explicit = process.env.GSC_SITE_URL;
  if (explicit) return explicit;
  try {
    const r = await fetch("https://searchconsole.googleapis.com/webmasters/v3/sites", {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const sites = ((await r.json()) as { siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> }).siteEntry ?? [];
    const usable = sites.filter((s) => s.permissionLevel !== "siteUnverifiedUser" && /pokeev\.com/i.test(s.siteUrl));
    return (usable.find((s) => s.siteUrl.startsWith("sc-domain:")) ?? usable[0])?.siteUrl ?? null;
  } catch {
    return null;
  }
}

export interface GscRow {
  keys: string[]; // [query, page] in our queries
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export async function gscQuery(body: {
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit?: number;
}): Promise<GscRow[] | null> {
  const saJson = process.env.GSC_SA_JSON;
  if (!saJson) return null;
  const token = await getAccessToken(saJson);
  if (!token) return null;
  const site = await resolveSiteUrl(token);
  if (!site) return null;
  try {
    const r = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ rowLimit: 1000, ...body }),
      },
    );
    if (!r.ok) return null;
    return ((await r.json()) as { rows?: GscRow[] }).rows ?? [];
  } catch {
    return null;
  }
}

export function isGscConfigured(): boolean {
  return Boolean(process.env.GSC_SA_JSON);
}
