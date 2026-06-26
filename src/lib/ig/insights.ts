// Last-post recap: pull the most recent @pokeev.tcg media + its insights so the morning digest
// can tell the owner how yesterday's carousel performed. Uses the same Instagram-Login Graph
// host as the publisher. Fully best-effort — returns null on any error (the digest just omits it).
const GV = () => process.env.META_GRAPH_VERSION || "v21.0";
const BASE = () => `https://graph.instagram.com/${GV()}`;

async function gget(path: string, params: Record<string, string>): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${BASE()}/${path}?${new URLSearchParams(params)}`);
    if (!r.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface PostRecap {
  caption: string;
  permalink: string;
  timestamp: string;
  likes: number | null;
  comments: number | null;
  reach: number | null;
  saved: number | null;
  shares: number | null;
}

export async function getLastPostRecap(): Promise<PostRecap | null> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return null;
  const ig = process.env.INSTAGRAM_BUSINESS_ID;
  const owner = ig ?? (await gget("me", { fields: "user_id", access_token: token }))?.user_id;
  if (!owner) return null;

  const media = await gget(`${owner}/media`, {
    fields: "id,caption,permalink,timestamp,like_count,comments_count",
    limit: "1",
    access_token: token,
  });
  const m = (media?.data as Array<Record<string, unknown>> | undefined)?.[0];
  if (!m?.id) return null;

  // Insights are best-effort: some metrics aren't valid for every media type, and a single
  // bad metric 400s the whole call — so we ask, but never depend on it.
  const ins = await gget(`${m.id}/insights`, {
    metric: "reach,saved,shares",
    access_token: token,
  });
  const byName: Record<string, number> = {};
  for (const row of (ins?.data as Array<Record<string, unknown>> | undefined) ?? []) {
    const name = row.name as string;
    const val = (row.values as Array<{ value?: number }> | undefined)?.[0]?.value;
    if (typeof val === "number") byName[name] = val;
  }

  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    caption: String(m.caption ?? "").split("\n")[0].slice(0, 80),
    permalink: String(m.permalink ?? ""),
    timestamp: String(m.timestamp ?? ""),
    likes: num(m.like_count),
    comments: num(m.comments_count),
    reach: byName.reach ?? null,
    saved: byName.saved ?? null,
    shares: byName.shares ?? null,
  };
}
