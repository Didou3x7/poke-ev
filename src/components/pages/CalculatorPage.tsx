import { Suspense } from "react";
import { getDict } from "@/lib/i18n";
import { absoluteUrl, localePath, type Locale } from "@/lib/i18n/config";
import { buildCalculatorShell } from "@/lib/view/calculator-vm";
import { SiteShell } from "@/components/SiteShell";
import { Calculator } from "@/components/calculator/Calculator";

export async function CalculatorPage({ locale }: { locale: Locale }) {
  const t = getDict(locale);
  const payload = await buildCalculatorShell(locale);
  // EMPTY_SNAPSHOT fallback: no EV data anywhere and the 1970 sentinel date.
  const snapshotMissing = !payload.demo && payload.evCount === 0 && payload.generatedAt.startsWith("1970");

  // WebApplication schema — a free in-browser tool, eligible for rich results on
  // "Pokémon TCG calculator"-class queries.
  const appLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: `Poké EV · ${t.calculator.title}`,
    url: absoluteUrl(localePath(locale, "calculator")),
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    description: t.calculator.sub,
    inLanguage: locale === "fr" ? "fr-FR" : "en-US",
    offers: { "@type": "Offer", price: "0", priceCurrency: locale === "fr" ? "EUR" : "USD" },
  };

  return (
    <SiteShell locale={locale} page="calculator" pricesUpdatedAt={payload.generatedAt} demo={payload.demo}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd).replace(/</g, "\\u003c") }}
      />
      <div className="bg-grid">
        <div className="mx-auto w-full max-w-4xl px-4 pb-8 pt-16 sm:px-6">
          <h1 className="rise font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {t.calculator.title}
          </h1>
          <p className="rise mt-3 text-lg text-fg-muted" style={{ "--rise-delay": "90ms" } as React.CSSProperties}>
            {t.calculator.sub}
          </p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        {snapshotMissing ? (
          <p
            role="status"
            className="mb-6 rounded-2xl border border-keep/30 bg-keep-deep px-5 py-4 text-sm leading-relaxed text-keep"
          >
            {t.calculator.noSnapshot}
          </p>
        ) : null}
        <div className="rise" style={{ "--rise-delay": "180ms" } as React.CSSProperties}>
          <Suspense>
            <Calculator
              payload={payload}
              dict={{ calculator: t.calculator, verdict: t.verdict, confidence: t.confidence }}
            />
          </Suspense>
        </div>
      </div>
    </SiteShell>
  );
}
