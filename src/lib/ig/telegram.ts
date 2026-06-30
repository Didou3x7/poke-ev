// Thin Telegram Bot API helpers for the webhook — just the few methods we need to give
// the editor INSTANT feedback on a tap (stop the spinner, edit the message, reply).
const API = (method: string) =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

async function call(method: string, payload: unknown): Promise<unknown> {
  const r = await fetch(API(method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await r.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!data.ok) throw new Error(`telegram ${method}: ${data.description}`);
  return data.result;
}

/** Stop the inline-button spinner immediately (the whole point of the webhook). */
export async function answerCallback(id: string, text: string): Promise<void> {
  try {
    await call("answerCallbackQuery", { callback_query_id: id, text });
  } catch {
    /* never let a feedback hiccup break the flow */
  }
}

export async function sendMessage(chatId: string, text: string): Promise<void> {
  try {
    await call("sendMessage", { chat_id: chatId, text: text.slice(0, 4000) });
  } catch {
    /* best-effort */
  }
}

/** Deliver the rendered Reel as a NATIVE Telegram video — uploaded as bytes (multipart, up to
 *  ~50MB) so it's saveable to the phone straight from the chat, exactly like the preview. We send
 *  by upload (not by URL) because Telegram caps by-URL videos at 20MB and our crf16 MP4 is bigger.
 *  Returns false on any hiccup so the caller can fall back to a link. */
export async function sendVideo(chatId: string, videoUrl: string, caption = ""): Promise<boolean> {
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`fetch video ${res.status}`);
    const buf = await res.arrayBuffer();
    const form = new FormData();
    form.append("chat_id", chatId);
    if (caption) form.append("caption", caption.slice(0, 1024));
    form.append("width", "1080");
    form.append("height", "1920");
    form.append("supports_streaming", "true");
    form.append("video", new Blob([buf], { type: "video/mp4" }), "reel.mp4");
    const r = await fetch(API("sendVideo"), { method: "POST", body: form });
    const data = (await r.json()) as { ok: boolean; description?: string };
    if (!data.ok) throw new Error(`telegram sendVideo: ${data.description}`);
    return true;
  } catch {
    return false;
  }
}

/** Replace the preview message's buttons with a single status line (✅ Approved etc.) so
 *  the editor sees the decision stuck to the message, not just a transient toast. */
export async function setDecisionLabel(
  chatId: string,
  messageId: number,
  label: string,
): Promise<void> {
  try {
    await call("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [[{ text: label, callback_data: "noop" }]] },
    });
  } catch {
    /* the message may be too old to edit — the toast + a sendMessage still inform the editor */
  }
}
