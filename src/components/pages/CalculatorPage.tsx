import { Suspense } from "react";
import { getDict } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { buildCalculatorPayload } from "@/lib/view/calculator-vm";
import { SiteShell } from "@/components/SiteShell";
import { Calculator } from "@/components/calculator/Calculator";

export async function CalculatorPage({ locale }: { locale: Locale }) {
  const t = getDict(locale);
  const payload = await buildCalculatorPayload(locale);
  // EMPTY_SNAPSHOT fallback: no EV data anywhere and the 1970 sentinel date.
  const snapshotMissing =
    !payload.demo &&
    Object.keys(payload.evData).length === 0 &&
    payload.generatedAt.startsWith("1970");

  return (
    <SiteShell locale={locale} page="calculator" pricesUpdatedAt={payload.generatedAt} demo={payload.demo}>
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
