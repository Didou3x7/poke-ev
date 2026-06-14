"use client";

import Link from "next/link";
import type { FeaturedSet } from "@/lib/view/featured";
import { formatMoney, formatPct, localePath, type Locale } from "@/lib/i18n/config";

/**
 * Trading-terminal style ticker: an infinite horizontal scroll of sets with
 * their pack EV and market verdict. CSS transform marquee (GPU-cheap), pausing
 * on hover, duplicated once so the loop is seamless.
 */
export function VerdictTicker({
  items,
  locale,
  label,
}: {
  items: FeaturedSet[];
  locale: Locale;
  label: string;
}) {
  if (items.length === 0) return null;
  const row = [...items, ...items];

  return (
    <div className="relative flex items-stretch overflow-hidden border-y border-line bg-ink-950/40">
      <span className="z-10 flex shrink-0 items-center gap-2 border-r border-line bg-ink-900 px-4 font-mono text-[10px] uppercase tracking-[0.2em] text-holo-cyan">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-open" />
        {label}
      </span>
      <div className="ticker-mask relative flex-1 overflow-hidden">
        <div className="ticker-track flex w-max items-center">
          {row.map((s, i) => {
            const tone =
              s.verdict === "open" ? "text-open" : s.verdict === "keep" ? "text-keep" : "text-fg-muted";
            return (
              <Link
                key={`${s.id}-${i}`}
                href={localePath(locale, "set", s.id)}
                className="flex items-center gap-2.5 whitespace-nowrap px-5 py-2.5 font-mono text-xs transition-colors hover:bg-surface/60"
                aria-hidden={i >= items.length}
                tabIndex={i >= items.length ? -1 : 0}
              >
                <span className="font-display text-sm font-semibold tracking-tight">{s.name}</span>
                <span className="holo-text tnum">{formatMoney(s.packEv, locale)}</span>
                {s.verdict ? (
                  <span className={`uppercase tracking-wider ${tone}`}>
                    {s.verdict === "open" ? "▲" : "▼"}
                    {s.marginPct != null ? ` ${formatPct(s.marginPct, locale)}` : ""}
                  </span>
                ) : null}
                <span className="text-fg-faint">·</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
