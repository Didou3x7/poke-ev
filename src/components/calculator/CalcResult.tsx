"use client";

import { useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { formatMoney, formatPct, localePath, type Locale } from "@/lib/i18n/config";
import { tpl } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n/types";
import { track } from "@/lib/analytics";
import type { ProductKind, Verdict } from "@/lib/ev/types";
import type { CalcSetData } from "@/lib/view/calculator-vm";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { VerdictBadge } from "@/components/VerdictBadge";
import { ConfidenceBar } from "@/components/ConfidenceBar";
import { ChaseCard } from "@/components/ChaseCard";
import { CalcBreakdown } from "./CalcBreakdown";

export interface Result {
  setId: string;
  kind: ProductKind;
  packs: number;
  price: number;
  verdict: Verdict;
  data: CalcSetData;
}

/** The verdict + stats + chase + breakdown panel (everything shown after a
 *  calculation). Split out of Calculator to keep that file focused on input. */
export function CalcResult({
  result,
  setName,
  dict,
  t,
  compact,
  locale,
  fx,
}: {
  result: Result | null;
  setName: string;
  dict: Pick<Dict, "verdict" | "confidence">;
  t: Dict["calculator"];
  compact: boolean;
  locale: Locale;
  fx: { eurUsd: number; asOf: string } | null;
}) {
  const [copied, setCopied] = useState(false);

  async function share(): Promise<void> {
    if (!result) return;
    const url = window.location.href;
    const text = tpl(t.shareText, {
      verdict: dict.verdict[result.verdict.kind === "open" ? "open" : "keep"],
      set: setName,
      ev: formatMoney(result.verdict.openEv, locale),
      price: formatMoney(result.price, locale),
      margin: formatPct(result.verdict.marginPct, locale),
    });
    track("Share", { set: result.setId });
    if (navigator.share) {
      try {
        await navigator.share({ title: "Poké EV", text, url });
        return;
      } catch {
        /* user cancelled — fall through to clipboard */
      }
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  const fxLine = (() => {
    if (!result || !fx) return null;
    const { eurUsd, asOf } = fx;
    const converted = locale === "fr" ? result.verdict.openEv * eurUsd : result.verdict.openEv / eurUsd;
    const formatted = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
      style: "currency",
      currency: locale === "fr" ? "USD" : "EUR",
      maximumFractionDigits: 2,
    }).format(converted);
    return { formatted, note: tpl(t.converterNote, { rate: eurUsd.toFixed(4), date: asOf }) };
  })();

  return (
    <AnimatePresence mode="wait">
      {result ? (
        <m.div
          key={`${result.setId}-${result.kind}-${result.price}`}
          aria-live="polite"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8"
        >
          <div className="grid items-center gap-6 md:grid-cols-[auto_1fr]">
            <VerdictBadge
              kind={result.verdict.kind}
              label={dict.verdict[result.verdict.kind]}
              sub={result.verdict.kind === "open" ? dict.verdict.openSub : dict.verdict.keepSubMargin}
            />
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-faint">
                {t.openEv} · {t.products[result.kind]}
                {result.kind === "booster" && result.packs > 1 ? ` ×${result.packs}` : ""}
              </p>
              <p className="font-display text-5xl font-bold tracking-tight sm:text-6xl">
                <AnimatedNumber value={result.verdict.openEv} format={(n) => formatMoney(n, locale)} className="holo-text" />
              </p>
              <p className="mt-1 font-mono text-xs text-fg-muted tnum">
                {formatMoney(result.data.packEv, locale)} {t.perBooster}
                {fxLine ? (
                  <span className="text-fg-faint">
                    {" "}
                    · ≈ {fxLine.formatted} <span title={fxLine.note}>ⓘ</span>
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Stat
              label={t.margin}
              value={`${formatMoney(result.verdict.marginAbs, locale)} (${formatPct(result.verdict.marginPct, locale)})`}
              tone={result.verdict.marginAbs >= 0 ? "open" : "keep"}
            />
            <Stat
              label={t.profitProbability}
              value={formatPct(result.verdict.profitProbability, locale, false)}
              tone={result.verdict.profitProbability >= 0.5 ? "open" : "keep"}
              title={t.profitProbabilityNote}
            />
            <Stat
              label={t.sealedMarket}
              value={
                result.verdict.sealedMarketPrice != null
                  ? `${result.verdict.sealedEstimated ? "≈ " : ""}${formatMoney(result.verdict.sealedMarketPrice, locale)}`
                  : t.sealedUnknown
              }
              tone="neutral"
              title={result.verdict.sealedEstimated ? t.sealedEstimatedNote : undefined}
              sub={
                [
                  result.verdict.sealedEstimated ? t.sealedEstimated : null,
                  result.verdict.sealedPremium != null
                    ? `${t.sealedPremium}: ${formatMoney(result.verdict.sealedPremium, locale)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            />
          </div>

          <div className="mt-6">
            <ConfidenceBar
              confidence={result.data.confidence}
              label={dict.confidence.label}
              levelLabel={dict.confidence[result.data.confidence.label]}
              partLabels={dict.confidence.parts}
            />
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
              {tpl(t.completeness, { pct: `${Math.round(result.data.priceCompleteness * 100)} %` })} ·{" "}
              {tpl(t.evUpdated, {
                date: new Date(result.data.updatedAt).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US"),
              })}
            </p>
          </div>

          {!compact && result.data.chaseCard ? (
            <div className="mt-10 border-t border-line pt-8">
              <ChaseCard
                name={result.data.chaseCard.name}
                image={result.data.chaseCard.image}
                imageEn={result.data.chaseCard.imageEn}
                setName={setName}
                eyebrow={t.chaseLabel}
                value={formatMoney(result.data.chaseCard.value, locale)}
              />
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void share()}
              className="rounded-full border border-line px-5 py-2 text-sm text-fg transition-colors duration-150 hover:border-line-strong hover:bg-surface"
            >
              {copied ? t.shareCopied : t.share}
            </button>
            {compact ? (
              <a
                href={`${localePath(locale, "calculator")}?set=${result.setId}&product=${result.kind}&price=${result.price}`}
                className="text-sm text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
              >
                {t.fullBreakdown}
              </a>
            ) : null}
          </div>

          {!compact ? (
            <div className="mt-10">
              <CalcBreakdown data={result.data} locale={locale} t={t} />
            </div>
          ) : null}
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

function Stat({
  label,
  value,
  tone,
  sub,
  title,
}: {
  label: string;
  value: string;
  tone: "open" | "keep" | "neutral";
  sub?: string;
  title?: string;
}) {
  const toneCls = tone === "open" ? "text-open" : tone === "keep" ? "text-keep" : "text-fg";
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3" title={title}>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-faint">{label}</p>
      <p className={`mt-1 font-mono text-base tnum ${toneCls}`}>{value}</p>
      {sub ? <p className="mt-0.5 font-mono text-[10px] text-fg-faint tnum">{sub}</p> : null}
    </div>
  );
}
