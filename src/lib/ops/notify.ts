// Server-side Telegram notifier for the ops crons (watchdog / digest / data alerts).
// Reuses the bot's Telegram channel (same chat the IG approvals land in) so all
// operational signal — "Blob suspended", "new set released", "biggest movers" — reaches
// the owner in ONE place. Best-effort: a notify failure must never fail a cron.
import { sendMessage } from "@/lib/ig/telegram";

export async function notifyOps(text: string): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;
  await sendMessage(chatId, text);
}
