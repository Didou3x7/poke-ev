"use client";

import { motion } from "motion/react";
import type { CalcSetData } from "@/lib/view/calculator-vm";
import { formatMoney, type Locale } from "@/lib/i18n/config";
import type { Dict } from "@/lib/i18n/types";
import { RarityDonut } from "./RarityDonut";

/** Top contributing cards + animated rarity-contribution donut. */
export function CalcBreakdown({
  data,
  locale,
  t,
}: {
  data: CalcSetData;
  locale: Locale;
  t: Dict["calculator"];
}) {
  const rarityTotal = data.rarityBreakdown.reduce((a, r) => a + r.evContribution, 0);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section aria-label={t.topCards}>
        <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-faint">{t.topCards}</h3>
        <ol className="mt-3 space-y-1.5">
          {data.topCards.slice(0, 8).map((card, i) => (
            <motion.li
              key={`${card.name}-${card.number ?? i}`}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.05 * i, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="holo-hover flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2"
            >
              <span className="w-5 text-right font-mono text-xs text-fg-faint tnum">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{card.name}</p>
                <p className="font-mono text-[10px] text-fg-faint">
                  {card.number ? `#${card.number} · ` : ""}
                  {(card.probabilityPerPack * 100).toFixed(2)} % {t.topCardsProb}
                </p>
              </div>
              <span className="font-mono text-sm text-fg tnum">{formatMoney(card.value, locale)}</span>
            </motion.li>
          ))}
        </ol>
      </section>

      <section aria-label={t.rarityBreakdown}>
        <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-faint">{t.rarityBreakdown}</h3>
        <div className="mt-4">
          <RarityDonut
            rows={data.rarityBreakdown}
            locale={locale}
            total={rarityTotal}
            centerLabel={t.perBooster}
          />
        </div>
      </section>
    </div>
  );
}
