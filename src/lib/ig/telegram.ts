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
