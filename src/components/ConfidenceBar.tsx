"use client";

import { motion } from "motion/react";
import type { ConfidenceScore } from "@/lib/ev/types";

/** Three-part confidence gauge with the composite score. */
export function ConfidenceBar({
  confidence,
  label,
  levelLabel,
  partLabels,
}: {
  confidence: ConfidenceScore;
  label: string;
  levelLabel: string;
  partLabels: { pullRates: string; prices: string; freshness: string };
}) {
  const parts = [
    { key: "pullRates", value: confidence.parts.pullRates, label: partLabels.pullRates },
    { key: "prices", value: confidence.parts.prices, label: partLabels.prices },
    { key: "freshness", value: confidence.parts.freshness, label: partLabels.freshness },
  ];
  const tone =
    confidence.label === "high" ? "text-open" : confidence.label === "medium" ? "text-keep" : "text-danger";

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-faint">{label}</span>
        <span className={`font-mono text-sm ${tone}`}>
          <span className="tnum">{confidence.score}</span>/100 · {levelLabel}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {parts.map((part, i) => (
          <div key={part.key}>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-850">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${part.value}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.1 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full"
                style={{ background: "var(--holo-gradient)" }}
              />
            </div>
            <p className="mt-1 text-[10px] text-fg-faint">{part.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
