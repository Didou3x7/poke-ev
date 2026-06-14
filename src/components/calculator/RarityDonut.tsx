"use client";

import { motion, useReducedMotion } from "motion/react";
import type { RarityBreakdown } from "@/lib/ev/types";
import type { RarityId } from "@/lib/ev/rarity";
import { rarityLabel } from "@/lib/i18n/rarities";
import { formatMoney, formatPct, type Locale } from "@/lib/i18n/config";

/** Brand-family palette; sliced in order of contribution. */
const PALETTE = ["#22d3ee", "#8b5cf6", "#e94bd0", "#34d399", "#f5b547", "#5dcaff", "#b07cff", "#ff8fd6"];

/**
 * Animated SVG donut of each rarity's share of pack EV, with a legend. The
 * holo-cyan→magenta family keeps it on-brand; arcs draw in on view.
 */
export function RarityDonut({
  rows,
  locale,
  total,
  centerLabel,
}: {
  rows: RarityBreakdown[];
  locale: Locale;
  total: number;
  centerLabel: string;
}) {
  const reduce = useReducedMotion();
  const data = rows.filter((r) => r.evContribution > 0).slice(0, 8);
  const sum = data.reduce((a, r) => a + r.evContribution, 0) || 1;

  const R = 60;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const segments = data.map((r, i) => {
    const frac = r.evContribution / sum;
    const seg = { color: PALETTE[i % PALETTE.length], frac, dash: frac * C, offset: offset * C, row: r };
    offset += frac;
    return seg;
  });

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        <svg width="160" height="160" viewBox="0 0 160 160" className="-rotate-90">
          <circle cx="80" cy="80" r={R} fill="none" stroke="var(--color-ink-850)" strokeWidth="16" />
          {segments.map((s, i) => (
            <motion.circle
              key={s.row.rarity}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="16"
              strokeDasharray={`${s.dash} ${C - s.dash}`}
              strokeDashoffset={-s.offset}
              strokeLinecap="butt"
              initial={reduce ? false : { opacity: 0 }}
              whileInView={reduce ? undefined : { opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 + i * 0.08, duration: 0.4 }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-lg font-bold tracking-tight holo-text tnum">
            {formatMoney(total, locale)}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-fg-faint">{centerLabel}</span>
        </div>
      </div>

      <ul className="grid flex-1 grid-cols-1 gap-1.5 xs:grid-cols-2 sm:grid-cols-1">
        {segments.map((s) => (
          <li key={s.row.rarity} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
              <span className="truncate">{rarityLabel(s.row.rarity as RarityId, locale)}</span>
            </span>
            <span className="shrink-0 font-mono text-fg-muted tnum">{formatPct(s.frac, locale, false)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
