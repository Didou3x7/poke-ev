// Direct Instagram carousel publish — a faithful TypeScript port of the Python bot's
// publish_to_instagram (instagram-bot/main.py), so the webhook can post the moment the
// editor approves in the evening, without waiting for a GitHub Actions cron tick. Uses the
// Instagram-Login Graph host (graph.instagram.com), same as the bot.
const GV = () => process.env.META_GRAPH_VERSION || "v21.0";
const BASE = () => `https://graph.instagram.com/${GV()}`;

async function graphPost(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const r = await fetch(`${BASE()}/${path}`, {
    method: "POST",
    body: new URLSearchParams(params),
  });
  const j = (await r.json()) as Record<string, unknown>;
  if (!r.ok) throw new Error(`graph POST ${path}: ${JSON.stringify(j)}`);
  return j;
}

async function graphGet(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(params);
  const r = await fetch(`${BASE()}/${path}?${qs}`);
  const j = (await r.json()) as Record<string, unknown>;
  if (!r.ok) throw new Error(`graph GET ${path}: ${JSON.stringify(j)}`);
  return j;
}

async function igUserId(token: string): Promise<string> {
  const j = await graphGet("me", { fields: "user_id", access_token: token });
  return String(j.user_id);
}

async function waitFinished(cid: string, token: string, tries = 25, delayMs = 3000): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const st = (await graphGet(cid, { fields: "status_code", access_token: token })).status_code;
    if (st === "FINISHED") return;
    if (st === "ERROR") throw new Error(`container ${cid} ERROR`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`container ${cid} not FINISHED`);
}

export interface PublishResult {
  mediaId: string;
  permalink: string;
}

/** Build the per-slide containers, the carousel parent, then publish. Returns the media id
 *  + permalink (best-effort). Throws on any Graph error so the caller can alert + keep the
 *  approval for a retry. */
export async function publishCarousel(slides: string[], caption: string): Promise<PublishResult> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN missing");
  const ig = process.env.INSTAGRAM_BUSINESS_ID || (await igUserId(token));

  const children: string[] = [];
  for (const url of slides.slice(0, 10)) {
    const j = await graphPost(`${ig}/media`, {
      image_url: url,
      is_carousel_item: "true",
      access_token: token,
    });
    children.push(String(j.id));
  }
  for (const cid of children) await waitFinished(cid, token);

  const parent = String(
    (
      await graphPost(`${ig}/media`, {
        media_type: "CAROUSEL",
        caption,
        children: children.join(","),
        access_token: token,
      })
    ).id,
  );
  await waitFinished(parent, token);

  const mediaId = String((await graphPost(`${ig}/media_publish`, { creation_id: parent, access_token: token })).id);

  let permalink = "";
  try {
    permalink = String(
      (await graphGet(mediaId, { fields: "permalink", access_token: token })).permalink || "",
    );
  } catch {
    /* permalink is a nicety, not required */
  }
  return { mediaId, permalink };
}

/** Publish a rendered MP4 as an Instagram Reel (media_type=REELS). The bot (GitHub Actions)
 *  renders + hosts the MP4; this only needs the public video_url, so the webhook can publish a
 *  Reel in the evening just like a carousel. Video containers process slower → a longer poll. */
export async function publishReel(
  videoUrl: string,
  caption: string,
  coverUrl?: string | null,
): Promise<PublishResult> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN missing");
  const ig = process.env.INSTAGRAM_BUSINESS_ID || (await igUserId(token));

  const params: Record<string, string> = {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    share_to_feed: "true",
    access_token: token,
  };
  if (coverUrl) params.cover_url = coverUrl;

  const cid = String((await graphPost(`${ig}/media`, params)).id);
  await waitFinished(cid, token, 60, 5000); // ~5 min budget — video encode is slow

  const mediaId = String((await graphPost(`${ig}/media_publish`, { creation_id: cid, access_token: token })).id);

  let permalink = "";
  try {
    permalink = String(
      (await graphGet(mediaId, { fields: "permalink", access_token: token })).permalink || "",
    );
  } catch {
    /* permalink is a nicety, not required */
  }
  return { mediaId, permalink };
}
