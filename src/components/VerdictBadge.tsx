"use client";

import { m } from "motion/react";
import type { VerdictKind } from "@/lib/ev/types";

const styles: Record<VerdictKind, { text: string; ring: string; bg: string; glow: string }> = {
  open: {
    text: "text-open",
    ring: "border-open/50",
    bg: "bg-open-deep",
    glow: "shadow-[0_0_32px_-6px_rgba(52,211,153,0.45)]",
  },
  keep: {
    text: "text-keep",
    ring: "border-keep/50",
    bg: "bg-keep-deep",
    glow: "shadow-[0_0_32px_-6px_rgba(245,181,71,0.4)]",
  },
  unavailable: {
    text: "text-fg-muted",
    ring: "border-line-strong",
    bg: "bg-surface",
    glow: "",
  },
};

export function VerdictBadge({
  kind,
  label,
  sub,
  size = "lg",
}: {
  kind: VerdictKind;
  label: string;
  sub?: string;
  size?: "sm" | "lg";
}) {
  const s = styles[kind];
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.86 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.15 }}
      className={`inline-flex flex-col items-center gap-1 ${size === "lg" ? "px-8 py-4" : "px-4 py-2"} rounded-2xl border ${s.ring} ${s.bg} ${s.glow}`}
    >
      <span
        className={`font-display font-bold ${s.text} ${size === "lg" ? "text-3xl tracking-[0.18em]" : "text-base tracking-[0.14em]"}`}
      >
        {label}
      </span>
      {sub ? <span className="max-w-64 text-center text-xs leading-snug text-fg-muted">{sub}</span> : null}
    </m.div>
  );
}
