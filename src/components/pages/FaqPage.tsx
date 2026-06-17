import { getDict } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { getSnapshot } from "@/lib/data/snapshot";
import { SiteShell } from "@/components/SiteShell";
import { FaqAccordion } from "@/components/pages/FaqAccordion";

export async function FaqPage({ locale }: { locale: Locale }) {
  const t = getDict(locale);
  const snapshot = await getSnapshot();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: t.faq.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <SiteShell locale={locale} page="faq" pricesUpdatedAt={snapshot.generatedAt} demo={snapshot.demo}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="bg-grid">
        <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-16 sm:px-6">
          <h1 className="rise font-display text-4xl font-bold tracking-tight sm:text-5xl">{t.faq.title}</h1>
          <p className="rise mt-3 text-lg text-fg-muted" style={{ "--rise-delay": "90ms" } as React.CSSProperties}>
            {t.faq.sub}
          </p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <FaqAccordion items={t.faq.items} />
        <p className="mt-10 rounded-2xl border border-keep/30 bg-keep-deep px-5 py-4 text-sm leading-relaxed text-keep">
          {t.common.footer.disclaimer}
        </p>
      </div>
    </SiteShell>
  );
}
