"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { formatMoney, localePath, type Locale } from "@/lib/i18n/config";
import { tpl } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n/types";
import { TiltCard } from "@/components/TiltCard";

export interface SetListItem {
  id: string;
  nameFr: string;
  nameEn: string;
  code: string | null;
  releaseDate: string;
  cardCount: number | null;
  era: string;
  eraName: string;
  evAvailable: boolean;
  packEv: number | null;
  logo: string | null;
}

export function SetsExplorer({
  items,
  eras,
  locale,
  t,
}: {
  items: SetListItem[];
  eras: { key: string; name: string }[];
  locale: Locale;
  t: Dict["sets"];
}) {
  const [query, setQuery] = useState("");
  const [era, setEra] = useState<string | null>(null);
  const [evOnly, setEvOnly] = useState(false);
  const [sort, setSort] = useState<"ev" | "date" | "name">("date");

  const name = (s: SetListItem) => (locale === "fr" ? s.nameFr : s.nameEn);

  // Global EV ranking (across the whole catalog) so a set keeps its rank under
  // any filter/sort.
  const evRank = useMemo(() => {
    const ranked = items
      .filter((s) => s.evAvailable && s.packEv != null)
      .sort((a, b) => (b.packEv ?? 0) - (a.packEv ?? 0));
    const map = new Map<string, number>();
    ranked.forEach((s, i) => map.set(s.id, i + 1));
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((s) => {
      if (era && s.era !== era) return false;
      if (evOnly && !s.evAvailable) return false;
      if (q && !s.nameFr.toLowerCase().includes(q) && !s.nameEn.toLowerCase().includes(q)) return false;
      return true;
    });
    const sorted = [...list];
    if (sort === "ev") {
      sorted.sort((a, b) => {
        if (a.evAvailable !== b.evAvailable) return a.evAvailable ? -1 : 1;
        return (b.packEv ?? 0) - (a.packEv ?? 0);
      });
    } else if (sort === "name") {
      sorted.sort((a, b) => name(a).localeCompare(name(b), locale));
    } else {
      sorted.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
    }
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, era, evOnly, sort, locale]);
  const pill = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-xs transition-colors duration-150 ${
      active
        ? "holo-ring font-medium text-fg"
        : "border-line text-fg-muted hover:border-line-strong hover:text-fg"
    }`;

  return (
    <div>
      <div className="flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full max-w-md rounded-xl border border-line bg-ink-850 px-4 py-3 text-fg placeholder:text-fg-faint focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-holo-violet/40"
          aria-label={t.searchPlaceholder}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={pill(era === null)} onClick={() => setEra(null)}>
            {t.filterAll}
          </button>
          {eras.map((e) => (
            <button key={e.key} type="button" className={pill(era === e.key)} onClick={() => setEra(e.key)}>
              {e.name}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-line" aria-hidden />
          <button type="button" className={pill(evOnly)} onClick={() => setEvOnly((v) => !v)}>
            {t.filterWithEv}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-faint tnum">
            {tpl(t.resultCount, { n: filtered.length })}
          </p>
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <span className="font-mono uppercase tracking-[0.16em] text-fg-faint">{t.sortLabel}</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="rounded-lg border border-line bg-ink-850 px-3 py-1.5 text-sm text-fg focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-holo-violet/40"
            >
              <option value="date">{t.sortDate}</option>
              <option value="ev">{t.sortEv}</option>
              <option value="name">{t.sortName}</option>
            </select>
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-12 text-fg-muted">{t.emptySearch}</p>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s, i) => (
            <motion.li
              key={s.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.03, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <TiltCard glare={false} className="h-full">
              <Link
                href={localePath(locale, "set", s.id)}
                className="holo-hover group flex h-full flex-col justify-between rounded-2xl border border-line bg-surface p-5 transition-colors duration-150 hover:border-line-strong"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {evRank.get(s.id) && evRank.get(s.id)! <= 10 ? (
                        <span className="holo-ring shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium tnum">
                          #{evRank.get(s.id)}
                        </span>
                      ) : null}
                      <h3 className="truncate font-display text-base font-semibold leading-snug">{name(s)}</h3>
                    </div>
                    {s.code ? (
                      <span className="shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
                        {s.code}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-fg-faint">
                    {s.eraName} · {t.released}{" "}
                    {new Date(s.releaseDate).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
                      month: "short",
                      year: "numeric",
                    })}
                    {s.cardCount ? ` · ${tpl(t.cardsCount, { n: s.cardCount })}` : ""}
                  </p>
                </div>
                <div className="mt-4 flex items-baseline justify-between">
                  {s.evAvailable && s.packEv != null ? (
                    <>
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-faint">
                        {t.evBooster}
                      </span>
                      <span className="font-display text-xl font-bold tracking-tight holo-text tnum">
                        {formatMoney(s.packEv, locale)}
                      </span>
                    </>
                  ) : (
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-faint">
                      {t.evUnavailable}
                    </span>
                  )}
                </div>
              </Link>
              </TiltCard>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
