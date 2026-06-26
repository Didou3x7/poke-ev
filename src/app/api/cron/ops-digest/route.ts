// Morning digest — one Telegram message that tells the owner everything is green (snapshot
// fresh, EV sets, site 200, Blob active) AND how last night's carousel performed. A daily
// "all systems go" heartbeat: silence from the bot now means something's wrong, not just quiet.
import { NextResponse, type NextRequest } from "next/server";
import { SITE_URL } from "@/lib/i18n/config";
import { notifyOps } from "@/lib/ops/notify";
import { getLastPostRecap } from "@/lib/ig/insights";
import { readMovers } from "@/lib/data/movers";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const lines: string[] = ["📊 Poké EV — point du matin"];

  // System health
  try {
    const r = await fetch(`${SITE_URL}/api/health?deep=1`, { cache: "no-store" });
    if (r.ok) {
      const h = (await r.json()) as {
        snapshot?: { ageDays?: number; stale?: boolean; sets?: number; evSets?: number };
        blobStore?: { status?: string };
      };
      const s = h.snapshot;
      const green = !s?.stale && h.blobStore?.status === "active";
      lines.push(
        `${green ? "✅" : "⚠️"} Site 200 · snapshot ${s?.ageDays}j · ${s?.sets} sets (${s?.evSets} EV) · Blob ${h.blobStore?.status}`,
      );
    } else {
      lines.push(`⚠️ /api/health → HTTP ${r.status}`);
    }
  } catch {
    lines.push("⚠️ santé injoignable");
  }

  // Biggest mover of the day (if the daily refresh computed them)
  try {
    const m = await readMovers();
    const top = m.gainers[0];
    if (top) lines.push(`📈 Top mouvement : ${top.cardName} (${top.setName}) ${top.pct > 0 ? "+" : ""}${top.pct}%`);
  } catch {
    /* optional */
  }

  // Last IG post performance
  try {
    const p = await getLastPostRecap();
    if (p) {
      const bits = [
        p.likes != null ? `${p.likes} ❤️` : null,
        p.comments != null ? `${p.comments} 💬` : null,
        p.reach != null ? `${p.reach} 👀` : null,
        p.saved != null ? `${p.saved} 🔖` : null,
        p.shares != null ? `${p.shares} ↗️` : null,
      ].filter(Boolean);
      lines.push(`📱 Dernier post : ${bits.join(" · ") || "stats indispo"}${p.permalink ? `\n${p.permalink}` : ""}`);
    }
  } catch {
    /* optional */
  }

  await notifyOps(lines.join("\n"));
  return NextResponse.json({ ok: true });
}
