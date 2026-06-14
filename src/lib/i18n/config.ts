/**
 * i18n routing — FR lives at the root, EN under /en, with localized slugs:
 *   /calculateur ↔ /en/calculator, /sets ↔ /en/sets, /faq ↔ /en/faq…
 * The locale drives the price market too: fr → Cardmarket FR (EUR),
 * en → TCGPlayer US (USD).
 */

export const locales = ["fr", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "fr";

export const LOCALE_COOKIE = "NEXT_LOCALE";

export type PageKey =
  | "home"
  | "calculator"
  | "sets"
  | "set"
  | "faq"
  | "legal"
  | "privacy"
  | "cookies";

const staticPaths: Record<Locale, Record<Exclude<PageKey, "set">, string>> = {
  fr: {
    home: "/",
    calculator: "/calculateur",
    sets: "/sets",
    faq: "/faq",
    legal: "/mentions-legales",
    privacy: "/confidentialite",
    cookies: "/cookies",
  },
  en: {
    home: "/en",
    calculator: "/en/calculator",
    sets: "/en/sets",
    faq: "/en/faq",
    legal: "/en/legal-notice",
    privacy: "/en/privacy",
    cookies: "/en/cookies",
  },
};

export function localePath(locale: Locale, page: PageKey, slug?: string): string {
  if (page === "set") {
    if (!slug) throw new Error("set page needs a slug");
    return locale === "fr" ? `/sets/${slug}` : `/en/sets/${slug}`;
  }
  return staticPaths[locale][page];
}

/** Both-language URLs for a page — feeds hreflang and the language switch. */
export function alternates(page: PageKey, slug?: string): Record<Locale, string> {
  return { fr: localePath("fr", page, slug), en: localePath("en", page, slug) };
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pokeev.com";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path === "/" ? "" : path}`;
}

/** Currency + market metadata per locale. */
export const marketInfo: Record<Locale, { currency: "EUR" | "USD"; symbol: string; source: string }> = {
  fr: { currency: "EUR", symbol: "€", source: "Cardmarket FR" },
  en: { currency: "USD", symbol: "$", source: "TCGPlayer US" },
};

export function formatMoney(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency: marketInfo[locale].currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPct(ratio: number, locale: Locale, signed = true): string {
  const pct = ratio * 100;
  const formatted = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    maximumFractionDigits: 1,
  }).format(Math.abs(pct));
  const sign = pct >= 0 ? (signed ? "+" : "") : "−";
  return `${sign}${formatted} %`;
}
