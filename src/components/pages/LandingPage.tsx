import Link from "next/link";
import { Suspense } from "react";
import ReactDOM from "react-dom";
import { getDict, tpl } from "@/lib/i18n";
import { heroCardImage, heroCardPool } from "@/lib/hero-cards";
import { absoluteUrl, localePath, type Locale } from "@/lib/i18n/config";
import { buildCalculatorShell } from "@/lib/view/calculator-vm";
import { buildFeaturedSets } from "@/lib/view/featured";
import { getAllSets } from "@/lib/data/catalog";
import { SiteShell } from "@/components/SiteShell";
import { Calculator } from "@/components/calculator/Calculator";
import { AnimatedInt } from "@/components/AnimatedNumber";
import { HeroCardSlot } from "@/components/hero/HeroCards";
import { TiltCard } from "@/components/TiltCard";
import { Reveal } from "@/components/Reveal";
import { VerdictTicker } from "@/components/landing/VerdictTicker";
import { FeaturedSets } from "@/components/landing/FeaturedSets";

export async function LandingPage({ locale }: { locale: Locale }) {
  const t = getDict(locale);
  const payload = await buildCalculatorShell(locale);
  const featured = await buildFeaturedSets(locale, 14);

  // Fetch the first hero card (above-the-fold LCP candidate) during initial HTML
  // parse instead of after hydration, when the JS-gated <img> finally mounts.
  ReactDOM.preload(heroCardImage(locale, heroCardPool(locale)[0]), {
    as: "image",
    fetchPriority: "high",
  });

  const totalSets = getAllSets().length;
  const pricedCards = await countPricedCards();
  const updatedLabel = payload.generatedAt.startsWith("1970")
    ? "–"
    : new Date(payload.generatedAt).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
        day: "numeric",
        month: "short",
      });

  const stats: { value: number | null; text: string; label: string }[] = [
    { value: totalSets, text: String(totalSets), label: t.landing.statSets },
    { value: pricedCards, text: pricedCards.toLocaleString(locale === "fr" ? "fr-FR" : "en-US"), label: t.landing.statCards },
    { value: null, text: updatedLabel, label: t.landing.statUpdated },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Poké EV",
    url: absoluteUrl(localePath(locale, "home")),
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    description: t.meta.home.description,
    offers: { "@type": "Offer", price: "0", priceCurrency: locale === "fr" ? "EUR" : "USD" },
    inLanguage: locale,
  };

  return (
    <SiteShell locale={locale} page="home" pricesUpdatedAt={payload.generatedAt} demo={payload.demo}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {/* ——— hero ——— */}
      <section className="bg-grid relative overflow-hidden">
        <div aria-hidden className="aurora-wrap">
          <span className="aurora-blob a" />
          <span className="aurora-blob b" />
          <span className="aurora-blob c" />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
          {/* 3-column grid on desktop: cards sit in their own side cells, so
              they can never overlap the title, CTAs or stats. */}
          <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
            <HeroCardSlot locale={locale} side="left" className="hidden justify-self-center lg:block" />

            <div className="mx-auto max-w-2xl text-center">
              <p className="rise font-mono text-[11px] uppercase tracking-[0.32em] text-fg-faint" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
                {t.landing.heroKicker}
              </p>
              <h1
                className="rise mt-5 font-display text-5xl font-bold leading-[1.04] tracking-tight sm:text-6xl xl:text-7xl"
                style={{ "--rise-delay": "90ms" } as React.CSSProperties}
              >
                {t.landing.heroTitle1}{" "}
                <span className="holo-text-animated">{t.landing.heroTitleHolo}</span>
                {t.landing.heroTitle2}
              </h1>
              <p
                className="rise mx-auto mt-6 max-w-xl text-lg leading-relaxed text-fg-muted"
                style={{ "--rise-delay": "180ms" } as React.CSSProperties}
              >
                {t.landing.heroSub}
              </p>
              <div className="rise mt-8 flex flex-wrap justify-center gap-3" style={{ "--rise-delay": "270ms" } as React.CSSProperties}>
                <Link
                  href={localePath(locale, "calculator")}
                  className="cta-shimmer rounded-full px-7 py-3 font-display text-sm font-semibold tracking-wide text-ink-950 transition-transform duration-150 hover:scale-[1.04] active:scale-[0.98]"
                  style={{ background: "var(--holo-gradient)" }}
                >
                  {t.landing.ctaCalculator}
                </Link>
                <Link
                  href={localePath(locale, "sets")}
                  className="rounded-full border border-line bg-ink-900/60 px-7 py-3 text-sm text-fg backdrop-blur-sm transition-colors duration-150 hover:border-line-strong hover:bg-surface"
                >
                  {t.landing.ctaSets}
                </Link>
              </div>

              <dl className="rise mx-auto mt-12 grid max-w-md grid-cols-3 gap-6" style={{ "--rise-delay": "360ms" } as React.CSSProperties}>
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <dd className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                      {stat.value != null ? (
                        <AnimatedInt value={stat.value} locale={locale === "fr" ? "fr-FR" : "en-US"} />
                      ) : (
                        <span className="holo-text">{stat.text}</span>
                      )}
                    </dd>
                    <dt className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                      {stat.label}
                    </dt>
                  </div>
                ))}
              </dl>
            </div>

            <HeroCardSlot locale={locale} side="right" className="hidden justify-self-center lg:block" />
          </div>
        </div>
      </section>

      {/* ——— live verdict ticker ——— */}
      {featured.length > 0 ? (
        <div className="mt-6">
          <VerdictTicker items={featured} locale={locale} label={t.landing.tickerLabel} />
        </div>
      ) : null}

      {/* ——— mini calculator ——— */}
      <section className="mx-auto mt-12 w-full max-w-4xl px-4 sm:px-6">
        <div className="rise" style={{ "--rise-delay": "450ms" } as React.CSSProperties}>
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.24em] text-fg-faint">
            {t.landing.miniCalcTitle}
          </h2>
          <div className="holo-ring rounded-2xl p-5 sm:p-6">
            <Suspense>
              <Calculator
                payload={payload}
                dict={{ calculator: t.calculator, verdict: t.verdict, confidence: t.confidence }}
                compact
              />
            </Suspense>
          </div>
        </div>
      </section>

      {/* ——— featured: top EV sets ——— */}
      <FeaturedSets items={featured} locale={locale} t={t.landing} verdictDict={t.verdict} />

      {/* ——— how it works ——— */}
      <section className="mx-auto mt-24 w-full max-w-6xl px-4 sm:px-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{t.landing.howTitle}</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {t.landing.howSteps.map((step, i) => (
            <Reveal as="li" key={step.title} delay={i * 0.08} className="h-full">
              <TiltCard glare={false} className="h-full">
                <div className="holo-hover flex h-full flex-col items-center rounded-2xl border border-line bg-surface p-6 text-center">
                  <span className="font-mono text-xs text-fg-faint">0{i + 1}</span>
                  <h3 className="mt-3 font-display text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{step.text}</p>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ——— features ——— */}
      <section className="mx-auto mt-20 w-full max-w-6xl px-4 sm:px-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {t.landing.featuresTitle}
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.landing.features.map((feature, i) => (
            <Reveal as="article" key={feature.title} delay={i * 0.07} className="h-full">
              <TiltCard glare={false} className="h-full">
                <div className="holo-hover h-full rounded-2xl border border-line bg-surface p-6">
                  <h3 className="font-display text-base font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{feature.text}</p>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
        <div className="mt-10">
          <Link
            href={localePath(locale, "sets")}
            className="group inline-flex items-center gap-1.5 font-display text-sm font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <span className="link-holo">{tpl(t.landing.seeAllSets, {})}</span>
            <span aria-hidden className="transition-transform duration-200 ease-out group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}

async function countPricedCards(): Promise<number> {
  const { getSnapshot } = await import("@/lib/data/snapshot");
  const snapshot = await getSnapshot();
  return Object.values(snapshot.sets).reduce(
    (acc, set) => acc + set.cards.filter((c) => c.eur != null || c.usd != null).length,
    0,
  );
}
