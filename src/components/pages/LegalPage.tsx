import { getDict } from "@/lib/i18n";
import type { Locale, PageKey } from "@/lib/i18n/config";
import { getSnapshot } from "@/lib/data/snapshot";
import { SiteShell } from "@/components/SiteShell";

/** Shared renderer for the three legal documents. */
export async function LegalPage({
  locale,
  page,
}: {
  locale: Locale;
  page: Extract<PageKey, "legal" | "privacy" | "cookies">;
}) {
  const t = getDict(locale);
  const doc = t.legalPages[page];
  const snapshot = await getSnapshot();

  return (
    <SiteShell locale={locale} page={page} pricesUpdatedAt={snapshot.generatedAt} demo={snapshot.demo}>
      <div className="mx-auto w-full max-w-3xl px-4 pt-16 sm:px-6">
        <h1 className="rise font-display text-4xl font-bold tracking-tight">{doc.title}</h1>
        <p className="rise mt-3 font-mono text-xs uppercase tracking-[0.18em] text-fg-faint">
          {locale === "fr" ? "Dernière mise à jour : juin 2026" : "Last updated: June 2026"}
        </p>
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
