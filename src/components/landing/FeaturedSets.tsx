import Link from "next/link";
import type { FeaturedSet } from "@/lib/view/featured";
import { formatMoney, formatPct, localePath, type Locale } from "@/lib/i18n/config";
import type { Dict } from "@/lib/i18n/types";
import { TiltCard } from "@/components/TiltCard";
import { Reveal } from "@/components/Reveal";

export function FeaturedSets({
  items,
  locale,
  t,
  verdictDict,
}: {
  items: FeaturedSet[];
  locale: Locale;
  t: Dict["landing"];
  verdictDict: Dict["verdict"];
}) {
  if (items.length === 0) return null;

  return (
    <section className="mx-auto mt-24 w-full max-w-6xl px-4 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{t.featuredTitle}</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-muted">{t.featuredSub}</p>
        </div>
        <Link
          href={localePath(locale, "sets")}
          className="font-display text-sm font-medium text-fg-muted transition-colors hover:text-fg"
        >
          {t.seeAllSets}
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.slice(0, 6).map((s, i) => {
          const tone =
            s.verdict === "open"
              ? "border-open/40 text-open"
              : s.verdict === "keep"
                ? "border-keep/40 text-keep"
                : "border-line text-fg-muted";
          return (
            <Reveal key={s.id} delay={i * 0.06} className="h-full">
              <TiltCard glare className="h-full">
                <Link
                  href={localePath(locale, "set", s.id)}
                  className="holo-hover group flex h-full flex-col justify-between rounded-2xl border border-line bg-surface p-6 transition-colors duration-150 hover:border-line-strong"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                        {s.eraName} · {s.releaseYear}
                      </p>
                      <h3 className="mt-1 truncate font-display text-lg font-semibold leading-snug">{s.name}</h3>
                    </div>
                    <span className="holo-ring shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium tnum">
                      #{i + 1}
                    </span>
                  </div>

                  <div className="mt-6 flex items-end justify-between">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-faint">
                        {t.evLabel}
                      </p>
                      <p className="font-display text-3xl font-bold tracking-tight holo-text tnum">
                        {formatMoney(s.packEv, locale)}
                      </p>
                    </div>
                    {s.verdict ? (
                      <span className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${tone}`}>
                        {verdictDict[s.verdict]}
                        {s.marginPct != null ? ` ${formatPct(s.marginPct, locale)}` : ""}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 h-1 overflow-hidden rounded-full bg-ink-850">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.round(s.priceCompleteness * 100)}%`, background: "var(--holo-gradient)" }}
                    />
                  </div>
                </Link>
              </TiltCard>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
