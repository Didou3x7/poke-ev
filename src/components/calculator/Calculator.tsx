"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { computeVerdict } from "@/lib/ev/verdict";
import type { ProductKind, Verdict } from "@/lib/ev/types";
import type { CalculatorPayload, CalcSetData, CalcSetOption } from "@/lib/view/calculator-vm";
import { formatMoney, formatPct, localePath, marketInfo, type Locale } from "@/lib/i18n/config";
import { tpl } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n/types";
import { track } from "@/lib/analytics";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { VerdictBadge } from "@/components/VerdictBadge";
import { ConfidenceBar } from "@/components/ConfidenceBar";
import { ChaseCard } from "@/components/ChaseCard";
import { CalcBreakdown } from "./CalcBreakdown";

interface Result {
  setId: string;
  kind: ProductKind;
  packs: number;
  price: number;
  verdict: Verdict;
  data: CalcSetData;
}

/** Shown before a set is picked, so the segmented control isn't empty. */
const PRODUCT_FALLBACK = [
  { kind: "booster" as const, packs: 1, sealedPrice: null },
  { kind: "display" as const, packs: 36, sealedPrice: null },
  { kind: "etb" as const, packs: 9, sealedPrice: null },
];

export function Calculator({
  payload,
  dict,
  compact = false,
}: {
  payload: CalculatorPayload;
  dict: Pick<Dict, "calculator" | "verdict" | "confidence">;
  compact?: boolean;
}) {
  const { locale } = payload;
  const t = dict.calculator;
  const pillId = compact ? "kind-pill-compact" : "kind-pill";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const [setId, setSetId] = useState<string | null>(null);
  const [kind, setKind] = useState<ProductKind>("display");
  const [boosterQty, setBoosterQty] = useState(1);
  const [priceText, setPriceText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [listOpen, setListOpen] = useState(false);
  // -1 = no option highlighted; drives the combobox's aria-activedescendant.
  const [activeIndex, setActiveIndex] = useState(-1);
  const [copied, setCopied] = useState(false);
  const hydratedFromUrl = useRef(false);

  const name = (s: CalcSetOption) => (locale === "fr" ? s.nameFr : s.nameEn);
  const selected = payload.sets.find((s) => s.id === setId) ?? null;
  const data = setId ? payload.evData[setId] : undefined;

  // Product segmented control (role=radiogroup): roving tabindex + arrow keys,
  // per the WAI-ARIA radio pattern the roles announce to assistive tech.
  const products = data?.products ?? PRODUCT_FALLBACK;
  const kinds = products.map((p) => p.kind);
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onProductKeyDown = (e: React.KeyboardEvent) => {
    const idx = kinds.indexOf(kind);
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % kinds.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + kinds.length) % kinds.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = kinds.length - 1;
    else return;
    e.preventDefault();
    setKind(kinds[next]);
    radioRefs.current[next]?.focus();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? payload.sets.filter(
          (s) => s.nameFr.toLowerCase().includes(q) || s.nameEn.toLowerCase().includes(q),
        )
      : payload.sets;
    // EV-enabled sets first, newest first (payload is already date-sorted).
    return [...base.filter((s) => s.evAvailable), ...base.filter((s) => !s.evAvailable)].slice(0, 60);
  }, [query, payload.sets]);

  const parsePrice = (text: string): number | null => {
    const n = Number.parseFloat(text.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : null;
  };

  function chooseSet(id: string): void {
    setSetId(id);
    setListOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }

  // WAI-ARIA combobox keyboard pattern: arrows move the active option, Enter
  // commits it, Escape closes. Focus stays on the input (aria-activedescendant).
  function onComboKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setListOpen(true);
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && listOpen && activeIndex >= 0 && filtered[activeIndex]) {
      e.preventDefault();
      chooseSet(filtered[activeIndex].id);
    } else if (e.key === "Escape" && listOpen) {
      e.preventDefault();
      setListOpen(false);
      setActiveIndex(-1);
    }
  }

  // Keep the highlighted option scrolled into view as arrows move it.
  useEffect(() => {
    if (activeIndex >= 0) {
      document.getElementById(`ev-opt-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  function compute(id = setId, productKind = kind, text = priceText, qty = boosterQty): void {
    const d = id ? payload.evData[id] : undefined;
    const price = parsePrice(text);
    if (!id || !d || price == null) return;
    const product = d.products.find((p) => p.kind === productKind) ?? d.products[0];
    // A booster's pack count is the user-chosen quantity; display/ETB are fixed.
    const packs = product.kind === "booster" ? Math.max(1, Math.min(99, Math.round(qty))) : product.packs;
    const sealedMarketPrice =
      product.sealedPrice == null
        ? null
        : product.kind === "booster"
          ? product.sealedPrice * packs
          : product.sealedPrice;
    const verdict = computeVerdict({
      pricePaid: price,
      kind: product.kind,
      packs,
      packEv: d.packEv,
      packStdDev: d.packStdDev,
      sealedMarketPrice,
    });
    setResult({ setId: id, kind: product.kind, packs, price, verdict, data: d });
    track("Calculation", { set: id, product: product.kind });
    track("Verdict", { kind: verdict.kind, set: id });
    const params = new URLSearchParams({ set: id, product: product.kind, price: String(price) });
    if (product.kind === "booster" && packs > 1) params.set("qty", String(packs));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function changeQty(next: number): void {
    const q = Math.max(1, Math.min(99, Math.round(next) || 1));
    setBoosterQty(q);
    if (result && kind === "booster") compute(setId, "booster", priceText, q);
  }

  // Rehydrate a shared result from the query string (deep links).
  useEffect(() => {
    if (hydratedFromUrl.current) return;
    hydratedFromUrl.current = true;
    const qsSet = searchParams.get("set");
    const qsProduct = searchParams.get("product") as ProductKind | null;
    const qsPrice = searchParams.get("price");
    if (qsSet && payload.evData[qsSet] && qsPrice && parsePrice(qsPrice) != null) {
      const k: ProductKind = qsProduct === "booster" || qsProduct === "etb" ? qsProduct : "display";
      const qsQty = Math.max(1, Math.min(99, Number(searchParams.get("qty")) || 1));
      setSetId(qsSet);
      setKind(k);
      setBoosterQty(qsQty);
      setPriceText(qsPrice);
      compute(qsSet, k, qsPrice, qsQty);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function share(): Promise<void> {
    if (!result || !selected) return;
    const url = window.location.href;
    const text = tpl(t.shareText, {
      verdict: dict.verdict[result.verdict.kind === "open" ? "open" : "keep"],
      set: name(selected),
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
    if (!result || !payload.fx) return null;
    const { eurUsd, asOf } = payload.fx;
    const converted =
      locale === "fr" ? result.verdict.openEv * eurUsd : result.verdict.openEv / eurUsd;
    const formatted = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
      style: "currency",
      currency: locale === "fr" ? "USD" : "EUR",
      maximumFractionDigits: 2,
    }).format(converted);
    return { formatted, note: tpl(t.converterNote, { rate: eurUsd.toFixed(4), date: asOf }) };
  })();

  const inputCls =
    "w-full rounded-xl border border-line bg-ink-850 px-4 py-3 text-fg placeholder:text-fg-faint focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-holo-violet/40 transition-colors duration-150";

  return (
    <div className={compact ? "" : "holo-ring rounded-2xl p-5 sm:p-7"}>
      {/* ——— form ——— */}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="relative">
          <label
            htmlFor="ev-set-input"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-faint"
          >
            {t.setLabel}
          </label>
          <input
            id="ev-set-input"
            type="text"
            role="combobox"
            aria-expanded={listOpen}
            aria-autocomplete="list"
            aria-controls="ev-set-listbox"
            aria-activedescendant={listOpen && activeIndex >= 0 ? `ev-opt-${activeIndex}` : undefined}
            className={`mt-1.5 ${inputCls}`}
            placeholder={t.setPlaceholder}
            value={selected && !listOpen ? name(selected) : query}
            onFocus={() => {
              setListOpen(true);
              setQuery("");
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setListOpen(true);
              setActiveIndex(-1);
            }}
            onKeyDown={onComboKeyDown}
            onBlur={() => setTimeout(() => setListOpen(false), 150)}
          />
          <AnimatePresence>
            {listOpen ? (
              <motion.ul
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-line bg-ink-850/95 shadow-2xl backdrop-blur-md"
                role="listbox"
                id="ev-set-listbox"
                aria-label={t.setLabel}
              >
                {filtered.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-fg-muted">{t.setSearchNoResult}</li>
                ) : (
                  filtered.map((s, i) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        id={`ev-opt-${i}`}
                        role="option"
                        aria-selected={i === activeIndex}
                        tabIndex={-1}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors duration-100 hover:bg-surface-2 disabled:opacity-40 ${
                          i === activeIndex ? "bg-surface-2" : ""
                        }`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => chooseSet(s.id)}
                      >
                        <span className="truncate">{name(s)}</span>
                        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
                          {s.evAvailable ? (
                            <span className="text-open">EV ✓</span>
                          ) : (
                            s.releaseDate.slice(0, 4)
                          )}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </motion.ul>
            ) : null}
          </AnimatePresence>
        </div>

        <div>
          <label
            htmlFor="ev-price-input"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-faint"
          >
            {t.priceLabel} ({marketInfo[locale].symbol})
          </label>
          <input
            id="ev-price-input"
            type="text"
            inputMode="decimal"
            className={`mt-1.5 ${inputCls} tnum`}
            placeholder={t.pricePlaceholder}
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && compute()}
          />
        </div>
      </div>

      {/* product segmented control */}
      <div
        className="mt-4 flex flex-wrap items-center gap-2"
        role="radiogroup"
        aria-label={t.productLabel}
        onKeyDown={onProductKeyDown}
      >
        {products.map((p, i) => {
            const active = kind === p.kind;
            return (
              <button
                key={p.kind}
                ref={(el) => {
                  radioRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setKind(p.kind)}
                // font-medium on ALL states so the label never changes width on
                // toggle (no reflow / no pill chasing a resizing target).
                className={`relative rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                  active
                    ? "border-transparent text-fg"
                    : "border-line text-fg-muted hover:border-line-strong hover:text-fg"
                }`}
              >
                {/* Shared-layout holo pill slides behind the active product.
                    Inline position:absolute is required: the unlayered .holo-ring
                    rule (position:relative) outranks Tailwind's layered .absolute
                    utility, so without it the pill collapses to a 2px sliver. */}
                {active ? (
                  <motion.span
                    aria-hidden
                    layoutId={pillId}
                    style={{ position: "absolute" }}
                    className="holo-ring inset-0 rounded-full"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                ) : null}
                <span className="relative z-10 inline-flex items-center">
                  {t.products[p.kind]}
                  {p.kind !== "booster" ? (
                    <span className="ml-1.5 font-mono text-[10px] text-fg-faint">
                      {tpl(t.packsCount, { n: p.packs })}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          },
        )}
        <button
          type="button"
          onClick={() => compute()}
          disabled={!setId || !data || parsePrice(priceText) == null}
          className="group relative ml-auto overflow-hidden rounded-full px-6 py-2.5 font-display text-sm font-semibold tracking-wide text-ink-950 transition-transform duration-150 hover:scale-[1.03] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--holo-gradient)" }}
        >
          {t.compute}
        </button>
      </div>

      {/* booster quantity — only when "Booster" is selected */}
      {kind === "booster" ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-faint">
            {t.boosterCount}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="−1"
              onClick={() => changeQty(boosterQty - 1)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-lg text-fg transition-colors hover:border-line-strong hover:bg-surface"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={99}
              inputMode="numeric"
              aria-label={t.boosterCount}
              value={boosterQty}
              onChange={(e) => changeQty(Number(e.target.value))}
              className="h-9 w-16 rounded-lg border border-line bg-ink-850 text-center text-fg tnum focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-holo-violet/40 [appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
            />
            <button
              type="button"
              aria-label="+1"
              onClick={() => changeQty(boosterQty + 1)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-lg text-fg transition-colors hover:border-line-strong hover:bg-surface"
            >
              +
            </button>
          </div>
        </div>
      ) : null}

      {/* set selected but no pull rates */}
      {selected && !data ? (
        <div className="mt-6 rounded-xl border border-line bg-surface p-5">
          <p className="font-display font-semibold text-fg">{t.noRates}</p>
          <p className="mt-1 text-sm leading-relaxed text-fg-muted">{t.noRatesHint}</p>
        </div>
      ) : null}
      {!selected ? (
        <p className="mt-5 font-mono text-xs uppercase tracking-[0.16em] text-fg-faint">{t.selectSetFirst}</p>
      ) : null}

      {/* ——— result ——— */}
      <AnimatePresence mode="wait">
        {result && selected ? (
          <motion.div
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
                sub={
                  result.verdict.kind === "open" ? dict.verdict.openSub : dict.verdict.keepSubMargin
                }
              />
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-faint">
                  {t.openEv} · {t.products[result.kind]}
                  {result.kind === "booster" && result.packs > 1 ? ` ×${result.packs}` : ""}
                </p>
                <p className="font-display text-5xl font-bold tracking-tight sm:text-6xl">
                  <AnimatedNumber
                    value={result.verdict.openEv}
                    format={(n) => formatMoney(n, locale)}
                    className="holo-text"
                  />
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
                    ? formatMoney(result.verdict.sealedMarketPrice, locale)
                    : t.sealedUnknown
                }
                tone="neutral"
                sub={
                  result.verdict.sealedPremium != null
                    ? `${t.sealedPremium}: ${formatMoney(result.verdict.sealedPremium, locale)}`
                    : undefined
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
                  date: new Date(result.data.updatedAt).toLocaleDateString(
                    locale === "fr" ? "fr-FR" : "en-US",
                  ),
                })}
              </p>
            </div>

            {/* chase card — the set's headline card, shown just before sharing (full mode) */}
            {!compact && result.data.chaseCard ? (
              <div className="mt-10 border-t border-line pt-8">
                <ChaseCard
                  name={result.data.chaseCard.name}
                  image={result.data.chaseCard.image}
                  imageEn={result.data.chaseCard.imageEn}
                  setName={name(selected)}
                  eyebrow={t.chaseLabel}
                  value={formatMoney(result.data.chaseCard.value, locale)}
                />
              </div>
            ) : null}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={share}
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
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
