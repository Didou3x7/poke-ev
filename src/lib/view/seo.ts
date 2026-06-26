import type { Metadata } from "next";
import { getDict, tpl } from "@/lib/i18n";
import { absoluteUrl, alternates, localePath, type Locale, type PageKey } from "@/lib/i18n/config";

type MetaKey = keyof ReturnType<typeof getDict>["meta"];

const pageToMeta: Record<PageKey, MetaKey> = {
  home: "home",
  calculator: "calculator",
  sets: "sets",
  set: "set",
  card: "card",
  faq: "faq",
  methodology: "methodology",
  legal: "legal",
  privacy: "privacy",
  cookies: "cookies",
  trends: "trends",
};

/** Localized metadata with canonical + hreflang + OG/Twitter for any page. */
export function pageMetadata(
  locale: Locale,
  page: PageKey,
  options: { slug?: string; vars?: Record<string, string | number>; ogImage?: string } = {},
): Metadata {
  const { slug, vars = {}, ogImage } = options;
  const meta = getDict(locale).meta[pageToMeta[page]];
  const title = tpl(meta.title, vars);
  const description = tpl(meta.description, vars);
  const alt = alternates(page, slug);
  const url = absoluteUrl(localePath(locale, page, slug));
  const image = ogImage ?? `/api/og?page=${page}${slug ? `&set=${slug}` : ""}&locale=${locale}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        "fr": absoluteUrl(alt.fr),
        "en": absoluteUrl(alt.en),
        "x-default": absoluteUrl(alt.fr),
      },
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "Poké EV",
      locale: locale === "fr" ? "fr_FR" : "en_US",
      alternateLocale: locale === "fr" ? "en_US" : "fr_FR",
      type: "website",
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
