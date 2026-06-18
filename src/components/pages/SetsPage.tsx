import { getDict } from "@/lib/i18n";
import { absoluteUrl, localePath, type Locale } from "@/lib/i18n/config";
import { getEras } from "@/lib/data/catalog";
import { getSnapshot } from "@/lib/data/snapshot";
import { pickChaseCard } from "@/lib/data/snapshot-types";
import { SiteShell } from "@/components/SiteShell";
import { SetsExplorer, type SetListItem } from "@/components/sets/SetsExplorer";

export async function SetsPage({ locale }: { locale: Locale }) {
  const t = getDict(locale);
  const snapshot = await getSnapshot();
  const eras = getEras();

  const items: SetListItem[] = eras
    .flatMap((era) =>
      era.sets.map((s) => {
        const snap = snapshot.sets[s.id];
        const chase = snap ? pickChaseCard(snap, locale) : null;
        return {
          id: s.id,
          nameFr: s.nameFr,
          nameEn: s.nameEn,
          code: s.code,
          releaseDate: s.releaseDate,
          cardCount: s.cardCount,
          era: era.era,
          eraName: locale === "fr" ? era.eraNameFr : era.eraNameEn,
          evAvailable: Boolean(snap?.ev),
          packEv: snap?.ev ? snap.ev[locale].packEv : null,
          chaseValue: chase?.value ?? null,
          confidence: snap?.pullRateConfidence ?? null,
          logo: snap?.logo ?? null,
        };
      }),
    )
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));

  const eraOptions = [...eras]
    .reverse()
    .map((e) => ({ key: e.era, name: locale === "fr" ? e.eraNameFr : e.eraNameEn }));

  // ItemList structured data — the full catalog, so search engines can surface
  // the set listing as a structured collection.
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t.sets.title,
    numberOfItems: items.length,
    itemListElement: items.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: locale === "fr" ? s.nameFr : s.nameEn,
      url: absoluteUrl(localePath(locale, "set", s.id)),
    })),
  };

  return (
    <SiteShell locale={locale} page="sets" pricesUpdatedAt={snapshot.generatedAt} demo={snapshot.demo}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd).replace(/</g, "\\u003c") }}
      />
      <div className="bg-grid">
        <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-16 sm:px-6">
          <h1 className="rise font-display text-4xl font-bold tracking-tight sm:text-5xl">{t.sets.title}</h1>
          <p
            className="rise mt-3 max-w-2xl text-lg text-fg-muted"
            style={{ "--rise-delay": "90ms" } as React.CSSProperties}
          >
            {t.sets.sub}
          </p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SetsExplorer items={items} eras={eraOptions} locale={locale} t={t.sets} />
      </div>
    </SiteShell>
  );
}
