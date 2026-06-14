import Link from "next/link";
import { notFound } from "next/navigation";
import { getDict, tpl } from "@/lib/i18n";
import { formatMoney, formatPct, localePath, type Locale } from "@/lib/i18n/config";
import { rarityLabel } from "@/lib/i18n/rarities";
import { getEraOfSet, getPullRatesForSet, getSetById } from "@/lib/data/catalog";
import { getSnapshot } from "@/lib/data/snapshot";
import { localizedCardName, pickChaseCard } from "@/lib/data/snapshot-types";
import { computeVerdict } from "@/lib/ev/verdict";
import type { ProductKind } from "@/lib/ev/types";
import type { RarityId } from "@/lib/ev/rarity";
import { SiteShell } from "@/components/SiteShell";
import { CardsTable } from "@/components/sets/CardsTable";
import { VerdictBadge } from "@/components/VerdictBadge";
import { ChaseCard } from "@/components/ChaseCard";

export async function SetDetailPage({ locale, slug }: { locale: Locale; slug: string }) {
  const set = getSetById(slug);
  if (!set) notFound();

  const t = getDict(locale);
  const snapshot = await getSnapshot();
  const snap = snapshot.sets[set.id] ?? null;
  const config = getPullRatesForSet(set.id);
  const era = getEraOfSet(set.id);
  const name = locale === "fr" ? set.nameFr : set.nameEn;
  const ev = snap?.ev ? snap.ev[locale] : null;
  const priceKey = locale === "fr" ? ("eur" as const) : ("usd" as const);
  const chase = snap ? pickChaseCard(snap, locale) : null;

  const packsOf = (kind: ProductKind): number | null => {
    if (kind === "booster") return 1;
    if (kind === "display") return config?.products.display?.packs ?? null;
    return config?.products.etb?.packs ?? null;
  };

  const sealed = (snap?.sealed ?? [])
    .filter((p) => p[priceKey] != null)
    .map((p) => {
      const packs = packsOf(p.kind);
      const verdict =
        ev && packs
          ? computeVerdict({
              pricePaid: p[priceKey]!,
              kind: p.kind,
              packs,
              packEv: ev.packEv,
              packStdDev: ev.packStdDev,
              sealedMarketPrice: p[priceKey],
            })
          : null;
      return { ...p, packs, verdict };
    });

  const topCards = (ev?.topCards ?? []).flatMap((tc) => {
    const card = snap?.cards.find((c) => c.id === tc.cardId);
    return card ? [{ ...tc, card }] : [];
  });
  const maxContribution = Math.max(...(ev?.rarityBreakdown.map((r) => r.evContribution) ?? [0]), 0.0001);

  const offers = sealed.filter((p) => p[priceKey] != null);
  const jsonLd =
    offers.length > 0 && !snapshot.demo
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: `Pokémon TCG · ${name}`,
          description: locale === "fr" ? `Produits scellés ${name} : EV et prix marché.` : `${name} sealed products: EV and market prices.`,
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: locale === "fr" ? "EUR" : "USD",
            lowPrice: Math.min(...offers.map((p) => p[priceKey]!)).toFixed(2),
            highPrice: Math.max(...offers.map((p) => p[priceKey]!)).toFixed(2),
            offerCount: offers.length,
          },
        }
      : null;

  return (
    <SiteShell locale={locale} page="set" slug={set.id} pricesUpdatedAt={snapshot.generatedAt} demo={snapshot.demo}>
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      ) : null}
      <div className="bg-grid">
        <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-14 sm:px-6">
          <Link
            href={localePath(locale, "sets")}
            className="font-mono text-xs text-fg-faint transition-colors hover:text-fg"
          >
            {t.common.backToSets}
          </Link>
          <div className="mt-4 grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-fg-faint">
                  {era ? (locale === "fr" ? era.eraNameFr : era.eraNameEn) : ""}
                  {set.code ? ` · ${set.code}` : ""} ·{" "}
                  {new Date(set.releaseDate).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </p>
                <h1 className="rise mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl">{name}</h1>
              </div>
              {ev ? (
                <div className="text-right">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                    {t.sets.evBooster}
                  </p>
                  <p className="font-display text-4xl font-bold tracking-tight holo-text tnum">
                    {formatMoney(ev.packEv, locale)}
                  </p>
                </div>
              ) : (
                <p className="rounded-full border border-line px-4 py-2 font-mono text-xs uppercase tracking-widest text-fg-muted">
                  {t.sets.evUnavailable}
                </p>
              )}
            </div>
            {chase ? (
              <ChaseCard
                name={chase.name}
                image={chase.image}
                imageEn={chase.imageEn}
                setName={name}
                eyebrow={t.calculator.chaseLabel}
                value={formatMoney(chase.value, locale)}
                eager
                className="justify-self-center lg:justify-self-end"
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl space-y-14 px-4 sm:px-6">
        {/* sealed products with market verdicts */}
        <section aria-label={t.setDetail.productsTitle}>
          <h2 className="font-display text-xl font-semibold">{t.setDetail.productsTitle}</h2>
          {sealed.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">{t.setDetail.noSealed}</p>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sealed.map((p, i) => (
                <article key={`${p.kind}-${i}`} className="holo-hover rounded-2xl border border-line bg-surface p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                        {t.setDetail.sealedKind[p.kind]}
                      </p>
                      <h3 className="mt-1 text-sm font-medium leading-snug">{p.name}</h3>
                    </div>
                    {p.verdict ? (
                      <VerdictBadge kind={p.verdict.kind} label={t.verdict[p.verdict.kind]} size="sm" />
                    ) : null}
                  </div>
                  <dl className="mt-4 space-y-1.5 font-mono text-sm">
                    <div className="flex justify-between">
                      <dt className="text-fg-faint">{t.setDetail.marketPrice}</dt>
                      <dd className="tnum">{formatMoney(p[priceKey]!, locale)}</dd>
                    </div>
                    {p.verdict ? (
                      <>
                        <div className="flex justify-between">
                          <dt className="text-fg-faint">{t.setDetail.evOpen}</dt>
                          <dd className="tnum">{formatMoney(p.verdict.openEv, locale)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-fg-faint">{t.calculator.margin}</dt>
                          <dd className={`tnum ${p.verdict.marginAbs >= 0 ? "text-open" : "text-keep"}`}>
                            {formatPct(p.verdict.marginPct, locale)}
                          </dd>
                        </div>
                      </>
                    ) : null}
                  </dl>
                  <Link
                    href={`${localePath(locale, "calculator")}?set=${set.id}&product=${p.kind}&price=${p[priceKey]}`}
                    className="mt-4 inline-block text-sm text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
                  >
                    {t.setDetail.openInCalculator}
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* top hits + rarity contribution */}
        {ev ? (
          <div className="grid gap-10 lg:grid-cols-2">
            <section aria-label={t.setDetail.topHits}>
              <h2 className="font-display text-xl font-semibold">{t.setDetail.topHits}</h2>
              <ol className="mt-4 space-y-1.5">
                {topCards.slice(0, 10).map((tc, i) => (
                  <li
                    key={tc.cardId}
                    className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2"
                  >
                    <span className="w-5 text-right font-mono text-xs text-fg-faint tnum">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{localizedCardName(tc.card, locale)}</p>
                      <p className="font-mono text-[10px] text-fg-faint">
                        {tc.card.number ? `#${tc.card.number} · ` : ""}
                        {(tc.probabilityPerPack * 100).toFixed(2)} % {t.calculator.topCardsProb}
                      </p>
                    </div>
                    <span className="font-mono text-sm tnum">{formatMoney(tc.value, locale)}</span>
                  </li>
                ))}
              </ol>
            </section>
            <section aria-label={t.setDetail.byRarity}>
              <h2 className="font-display text-xl font-semibold">{t.setDetail.byRarity}</h2>
              <div className="mt-4 space-y-2.5">
                {ev.rarityBreakdown
                  .filter((r) => r.evContribution > 0)
                  .map((row) => (
                    <div key={row.rarity}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm">{rarityLabel(row.rarity as RarityId, locale)}</span>
                        <span className="font-mono text-xs tnum">{formatMoney(row.evContribution, locale)}</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink-850">
                        <div
                          className="h-full"
                          style={{
                            width: `${(row.evContribution / maxContribution) * 100}%`,
                            background: "var(--holo-gradient)",
                            opacity: 0.85,
                          }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          </div>
        ) : null}

        {/* full card list */}
        {snap && snap.cards.length > 0 ? (
          <section>
            <h2 className="font-display text-xl font-semibold">{t.setDetail.cardsTitle}</h2>
            <div className="mt-4">
              <CardsTable
                locale={locale}
                labels={{
                  showAll: t.setDetail.showAllCards,
                  hide: t.setDetail.hideCards,
                  title: t.setDetail.cardsTitle,
                }}
                cards={snap.cards.map((c) => ({
                  id: c.id,
                  name: localizedCardName(c, locale),
                  number: c.number,
                  rarity: c.rarity,
                  rawRarity: c.rawRarity,
                  price: c[priceKey],
                }))}
              />
            </div>
          </section>
        ) : null}
      </div>
    </SiteShell>
  );
}
