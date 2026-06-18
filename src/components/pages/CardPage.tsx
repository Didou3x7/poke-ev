import { notFound } from "next/navigation";
import Link from "next/link";
import { getDict, tpl } from "@/lib/i18n";
import { absoluteUrl, formatMoney, localePath, type Locale } from "@/lib/i18n/config";
import { getSnapshot } from "@/lib/data/snapshot";
import { getCardPage } from "@/lib/view/card-meta";
import { SiteShell } from "@/components/SiteShell";
import { ChaseCard } from "@/components/ChaseCard";

/**
 * Long-tail "card price" page — one per collectible card, showing its current
 * market price, rarity, rank within the set and its share of the booster EV,
 * plus internal links to sibling cards and the set. Targets "<card> <set> price"
 * searches; Product + Breadcrumb + ItemList JSON-LD feed Google rich results.
 */
export async function CardPage({ locale, slug }: { locale: Locale; slug: string }) {
  const data = await getCardPage(slug, locale);
  if (!data) notFound();
  const t = getDict(locale);
  const snapshot = await getSnapshot();
  const setPath = localePath(locale, "set", data.setId);

  const intro = data.priceFormatted
    ? tpl(t.cardPage.intro, { card: data.cardName, set: data.setName, price: data.priceFormatted })
    : tpl(t.cardPage.introNoPrice, { card: data.cardName, set: data.setName });
  const rankText =
    data.rank === 1 ? tpl(t.cardPage.rankTextTop, { set: data.setName }) : tpl(t.cardPage.rankText, { rank: data.rank, set: data.setName });

  const url = absoluteUrl(localePath(locale, "card", slug));
  const productLd =
    data.price != null && !snapshot.demo
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: `${data.cardName} — ${data.setName} (Pokémon TCG)`,
          image: data.imageEn,
          category: "Trading Card Game Single",
          brand: { "@type": "Brand", name: "Pokémon TCG" },
          ...(data.number ? { sku: `${data.setId}-${data.number}` } : {}),
          offers: {
            "@type": "Offer",
            priceCurrency: locale === "fr" ? "EUR" : "USD",
            price: data.price.toFixed(2),
            availability: "https://schema.org/InStock",
            url,
          },
        }
      : null;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t.common.brand, item: absoluteUrl(localePath(locale, "home")) },
      { "@type": "ListItem", position: 2, name: t.common.nav.sets, item: absoluteUrl(localePath(locale, "sets")) },
      { "@type": "ListItem", position: 3, name: data.setName, item: absoluteUrl(setPath) },
      { "@type": "ListItem", position: 4, name: data.cardName, item: url },
    ],
  };

  const itemListLd =
    data.related.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: tpl(t.cardPage.relatedTitle, { set: data.setName }),
          itemListElement: data.related.map((r, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: r.name,
            url: absoluteUrl(localePath(locale, "card", r.slug)),
          })),
        }
      : null;

  const ld = (o: object) => (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(o).replace(/</g, "\\u003c") }} />
  );

  return (
    <SiteShell locale={locale} page="card" slug={slug} pricesUpdatedAt={snapshot.generatedAt} demo={snapshot.demo}>
      {ld(breadcrumb)}
      {productLd ? ld(productLd) : null}
      {itemListLd ? ld(itemListLd) : null}
      <div className="bg-grid">
        <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-14 sm:px-6">
          {/* visible breadcrumb */}
          <nav aria-label="Breadcrumb" className="font-mono text-[11px] text-fg-faint">
            <Link href={localePath(locale, "sets")} className="transition-colors hover:text-fg">
              {t.common.nav.sets}
            </Link>{" "}
            ·{" "}
            <Link href={setPath} className="transition-colors hover:text-fg">
              {data.setName}
            </Link>{" "}
            · <span className="text-fg-muted">{data.cardName}</span>
          </nav>

          <div className="mt-6 grid items-start gap-8 md:grid-cols-[auto_1fr]">
            <ChaseCard
              name={data.cardName}
              image={data.image}
              imageEn={data.imageEn}
              setName={data.setName}
              eyebrow={rankText}
              value={data.priceFormatted ?? undefined}
              eager
            />
            <div className="min-w-0">
              <h1 className="rise font-display text-4xl font-bold tracking-tight sm:text-5xl">{data.cardName}</h1>
              <p
                className="rise mt-3 max-w-xl text-lg leading-relaxed text-fg-muted"
                style={{ "--rise-delay": "90ms" } as React.CSSProperties}
              >
                {intro}{" "}
                {data.evSharePct != null ? tpl(t.cardPage.evShareText, { pct: data.evSharePct, set: data.setName }) : ""}
              </p>

              <dl className="mt-7 grid max-w-xl grid-cols-2 gap-3">
                <Field label={t.cardPage.priceLabel} value={data.priceFormatted ?? t.cardPage.priceUnavailable} big />
                <Field label={t.cardPage.setEvLabel} value={data.packEv != null ? formatMoney(data.packEv, locale) : "—"} />
                <Field label={t.cardPage.rarityLabel} value={data.rarity ?? "—"} />
                <Field label={t.cardPage.numberLabel} value={data.number ? `#${data.number}` : "—"} />
              </dl>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href={setPath}
                  className="holo-ring rounded-xl px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:text-fg"
                >
                  {tpl(t.cardPage.viewSet, { set: data.setName })}
                </Link>
                <Link
                  href={`${localePath(locale, "calculator")}?set=${data.setId}`}
                  className="rounded-xl border border-line px-4 py-2.5 text-sm text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  {t.cardPage.openInCalculator}
                </Link>
              </div>
              <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-fg-faint">
                {t.cardPage.updatedDaily}
              </p>
            </div>
          </div>

          {/* Related cards — internal links spread crawl + link equity. */}
          {data.related.length > 0 ? (
            <section aria-label={tpl(t.cardPage.relatedTitle, { set: data.setName })} className="mt-14">
              <h2 className="font-display text-xl font-semibold tracking-tight">
                {tpl(t.cardPage.relatedTitle, { set: data.setName })}
              </h2>
              <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {data.related.map((r) => (
                  <li key={r.slug}>
                    <Link
                      href={localePath(locale, "card", r.slug)}
                      className="holo-hover group flex h-full flex-col rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-line-strong"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.image}
                        alt={`${r.name} — ${data.setName}`}
                        loading="lazy"
                        className="mb-2 aspect-[5/7] w-full rounded-lg object-cover"
                      />
                      <span className="truncate text-xs font-medium leading-tight">{r.name}</span>
                      {r.priceFormatted ? (
                        <span className="mt-0.5 font-mono text-[11px] text-fg-muted tnum">{r.priceFormatted}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </SiteShell>
  );
}

function Field({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-faint">{label}</dt>
      <dd className={`mt-1 tnum ${big ? "font-display text-2xl font-bold tracking-tight holo-text" : "text-sm text-fg"}`}>
        {value}
      </dd>
    </div>
  );
}
