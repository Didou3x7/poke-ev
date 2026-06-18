import Link from "next/link";
import { getDict, tpl } from "@/lib/i18n";
import { alternates, localePath, marketInfo, type Locale, type PageKey } from "@/lib/i18n/config";
import { LanguageSwitch } from "./LanguageSwitch";

/** Header + footer chrome shared by every page. Server component. */

export function SiteShell({
  locale,
  page,
  slug,
  pricesUpdatedAt,
  demo,
  children,
}: {
  locale: Locale;
  page: PageKey;
  slug?: string;
  /** ISO date of the snapshot, shown in the footer. */
  pricesUpdatedAt?: string | null;
  demo?: boolean;
  children: React.ReactNode;
}) {
  const t = getDict(locale);
  const other: Locale = locale === "fr" ? "en" : "fr";
  const alt = alternates(page, slug);
  const nav = [
    { href: localePath(locale, "calculator"), label: t.common.nav.calculator, key: "calculator" as PageKey },
    { href: localePath(locale, "sets"), label: t.common.nav.sets, key: "sets" as PageKey },
    { href: localePath(locale, "faq"), label: t.common.nav.faq, key: "faq" as PageKey },
  ];
  const updated =
    pricesUpdatedAt &&
    new Date(pricesUpdatedAt).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-surface px-4 py-2 text-sm font-medium text-fg ring-2 ring-holo-violet focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
      >
        {t.common.skipToContent}
      </a>
      {demo ? (
        <p className="border-b border-keep/30 bg-keep-deep px-4 py-2 text-center font-mono text-xs text-keep">
          {t.common.demoBanner}
        </p>
      ) : null}
      <header className="sticky top-0 z-40 border-b border-line bg-ink-900/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href={localePath(locale, "home")} className="group flex items-baseline gap-2">
            <span className="font-display text-xl font-bold tracking-tight">
              Poké<span className="holo-text">EV</span>
            </span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-fg-faint sm:inline">
              {marketInfo[locale].source}
            </span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label={t.common.navAria}>
            {nav.map((item) => {
              const active = page === item.key;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  className={`nav-link rounded-lg px-3 py-2 text-sm transition-colors duration-150 hover:text-fg ${
                    active ? "text-fg" : "text-fg-muted"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <LanguageSwitch targetLocale={other} targetPath={alt[other]} label={t.common.switchLang} />
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">{children}</main>

      <footer className="mt-20 border-t border-line">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-xl">
              <p className="font-display text-lg font-semibold">
                Poké<span className="holo-text">EV</span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{t.common.footer.disclaimer}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-10 gap-y-2.5 text-sm">
              <Link className="link-holo w-fit py-1.5 text-fg-muted transition-colors hover:text-fg" href={localePath(locale, "methodology")}>
                {t.common.footer.method}
              </Link>
              <Link className="link-holo w-fit py-1.5 text-fg-muted transition-colors hover:text-fg" href={localePath(locale, "legal")}>
                {t.common.footer.legal}
              </Link>
              <Link className="link-holo w-fit py-1.5 text-fg-muted transition-colors hover:text-fg" href={localePath(locale, "privacy")}>
                {t.common.footer.privacy}
              </Link>
              <Link className="link-holo w-fit py-1.5 text-fg-muted transition-colors hover:text-fg" href={localePath(locale, "cookies")}>
                {t.common.footer.cookies}
              </Link>
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-2 border-t border-line pt-6 font-mono text-[11px] uppercase tracking-wider text-fg-faint md:flex-row md:justify-between">
            <span>
              {t.common.footer.priceSource}
              {updated ? ` · ${tpl(t.common.footer.pricesUpdated, { date: updated })}` : ""}
            </span>
            <span>{t.common.footer.rights}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
