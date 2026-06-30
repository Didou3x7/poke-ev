import Link from "next/link";
import Image from "next/image";
import { localePath, type Locale } from "@/lib/i18n/config";
import { readMovers, type MoverItem } from "@/lib/data/movers";
import { SiteShell } from "@/components/SiteShell";
import { PopularSearches } from "@/components/PopularSearches";

/**
 * "Today's movers" — the cards whose EUR market price moved most over the last 24h, recomputed
 * by the daily snapshot refresh. Fresh content every day → an SEO magnet + a feed for IG posts.
 * EUR is the canonical market (FR is the primary surface); the headline is the % move.
 */

const STR = {
  fr: {
    h1: "Tendances du jour",
    sub: "Les cartes Pokémon dont la cote a le plus bougé sur 24 h.",
    gainers: "Plus fortes hausses",
    losers: "Plus fortes baisses",
    empty: "Pas encore de données de tendances — elles arrivent au prochain rafraîchissement quotidien.",
    was: "était",
  },
  en: {
    h1: "Today's movers",
    sub: "The Pokémon cards whose market price moved most over the last 24h.",
    gainers: "Biggest gainers",
    losers: "Biggest losers",
    empty: "No trend data yet — it lands on the next daily refresh.",
    was: "was",
  },
};

function eur(v: number, locale: Locale): string {
  return locale === "fr" ? `${v.toFixed(2).replace(".", ",")} €` : `€${v.toFixed(2)}`;
}

function MoverRow({ item, locale }: { item: MoverItem; locale: Locale }) {
  const name = locale === "fr" ? (item.cardNameFr ?? item.cardName) : item.cardName;
  const up = item.pct > 0;
  const s = STR[locale];
  return (
    <li>
      <Link
        href={localePath(locale, "set", item.setId)}
        className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-line-strong"
      >
        {item.image ? (
          <Image
            src={item.image}
            alt={name}
            width={56}
            height={78}
            sizes="56px"
            className="h-[78px] w-[56px] flex-none rounded-md bg-ink-850 object-cover"
          />
        ) : (
          <div className="h-[78px] w-[56px] flex-none rounded-md bg-ink-850" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight">{name}</div>
          <div className="truncate text-xs text-fg-muted">{item.setName}</div>
          <div className="mt-1 font-mono text-xs text-fg-muted tnum">
            {s.was} {eur(item.oldEur, locale)} → <span className="text-fg">{eur(item.newEur, locale)}</span>
          </div>
        </div>
        <div className={`flex-none font-mono text-sm font-semibold tnum ${up ? "text-emerald-400" : "text-rose-400"}`}>
          {up ? "+" : ""}
          {item.pct}%
        </div>
      </Link>
    </li>
  );
}

export async function TrendsPage({ locale }: { locale: Locale }) {
  const movers = await readMovers();
  const s = STR[locale];
  const hasData = movers.gainers.length > 0 || movers.losers.length > 0;

  return (
    <SiteShell locale={locale} page="trends" pricesUpdatedAt={hasData ? movers.generatedAt : null}>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{s.h1}</h1>
        <p className="mt-2 text-fg-muted">{s.sub}</p>

        {!hasData ? (
          <p className="mt-10 rounded-2xl border border-line bg-surface p-6 text-fg-muted">{s.empty}</p>
        ) : (
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            <section>
              <h2 className="mb-4 font-display text-lg font-semibold tracking-tight text-emerald-400">{s.gainers}</h2>
              <ul className="grid gap-2">
                {movers.gainers.map((m, i) => (
                  <MoverRow key={`g${i}`} item={m} locale={locale} />
                ))}
              </ul>
            </section>
            <section>
              <h2 className="mb-4 font-display text-lg font-semibold tracking-tight text-rose-400">{s.losers}</h2>
              <ul className="grid gap-2">
                {movers.losers.map((m, i) => (
                  <MoverRow key={`l${i}`} item={m} locale={locale} />
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
      <PopularSearches locale={locale} />
    </SiteShell>
  );
}
