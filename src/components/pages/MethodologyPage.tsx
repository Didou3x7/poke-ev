import { getDict } from "@/lib/i18n";
import { absoluteUrl, localePath, type Locale } from "@/lib/i18n/config";
import { getSnapshot } from "@/lib/data/snapshot";
import { SiteShell } from "@/components/SiteShell";

/** Long-form, structured methodology / transparency page. Complements the FAQ
 *  with a TechArticle for topical authority on "how Pokémon EV is calculated". */
export async function MethodologyPage({ locale }: { locale: Locale }) {
  const t = getDict(locale);
  const doc = t.methodology;
  const snapshot = await getSnapshot();
  const url = absoluteUrl(localePath(locale, "methodology"));

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: doc.title,
    description: doc.intro,
    inLanguage: locale === "fr" ? "fr-FR" : "en-US",
    mainEntityOfPage: url,
    url,
    author: { "@type": "Organization", name: "Poké EV" },
    publisher: { "@type": "Organization", name: "Poké EV" },
    ...(snapshot.generatedAt.startsWith("1970") ? {} : { dateModified: snapshot.generatedAt }),
  };

  return (
    <SiteShell locale={locale} page="methodology" pricesUpdatedAt={snapshot.generatedAt} demo={snapshot.demo}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd).replace(/</g, "\\u003c") }}
      />
      <div className="mx-auto w-full max-w-3xl px-4 pt-16 sm:px-6">
        <h1 className="rise font-display text-4xl font-bold tracking-tight">{doc.title}</h1>
        <p
          className="rise mt-3 max-w-xl text-lg leading-relaxed text-fg-muted"
          style={{ "--rise-delay": "90ms" } as React.CSSProperties}
        >
          {doc.intro}
        </p>
        <p className="rise mt-4 font-mono text-xs uppercase tracking-[0.18em] text-fg-faint">{doc.updated}</p>
        <div className="mt-10 space-y-10">
          {doc.sections.map((section) => (
            <section key={section.h}>
              <h2 className="font-display text-xl font-semibold">{section.h}</h2>
              {section.p.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="mt-3 text-sm leading-relaxed text-fg-muted">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </SiteShell>
  );
}
