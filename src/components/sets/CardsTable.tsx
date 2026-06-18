"use client";

import { memo, useMemo, useState } from "react";
import { formatMoney, type Locale } from "@/lib/i18n/config";
import { rarityLabel } from "@/lib/i18n/rarities";
import type { RarityId } from "@/lib/ev/rarity";

export interface CardRow {
  id: string;
  name: string;
  number: string | null;
  rarity: RarityId | null;
  rawRarity: string | null;
  price: number | null;
}

/** Sortable, collapsible card list for the set detail page. Memoized — its
 *  `cards` prop is a stable server-rendered list, so it never needs to re-sort
 *  or re-render when an unrelated parent state changes. */
function CardsTableInner({
  cards,
  locale,
  labels,
}: {
  cards: CardRow[];
  locale: Locale;
  labels: { showAll: string; hide: string; title: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(() => [...cards].sort((a, b) => (b.price ?? -1) - (a.price ?? -1)), [cards]);
  const visible = expanded ? sorted : sorted.slice(0, 24);

  return (
    <section aria-label={labels.title}>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {visible.map((card) => (
          <li
            key={card.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm">{card.name}</p>
              <p className="font-mono text-[10px] text-fg-faint">
                {card.number ? `#${card.number} · ` : ""}
                {card.rarity ? rarityLabel(card.rarity, locale) : (card.rawRarity ?? "–")}
              </p>
            </div>
            <span className="shrink-0 font-mono text-sm tnum">
              {card.price != null ? formatMoney(card.price, locale) : "–"}
            </span>
          </li>
        ))}
      </ul>
      {cards.length > 24 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 rounded-full border border-line px-5 py-2 text-sm text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
        >
          {expanded ? labels.hide : `${labels.showAll} (${cards.length})`}
        </button>
      ) : null}
    </section>
  );
}

export const CardsTable = memo(CardsTableInner);
