import type { Metadata } from "next";
import { getAllSets, getSetById } from "@/lib/data/catalog";
import { getSnapshot } from "@/lib/data/snapshot";
import { formatMoney, localePath, type Locale } from "@/lib/i18n/config";
import { withSeoQuery } from "@/lib/ops/seo-targets";
import { pageMetadata } from "./seo";

export function setDetailStaticParams(): { slug: string }[] {
  return getAllSets().map((s) => ({ slug: s.id }));
}

export async function setDetailMetadata(locale: Locale, slug: string): Promise<Metadata> {
  const set = getSetById(slug);
  if (!set) return {};
  const snapshot = await getSnapshot();
  const ev = snapshot.sets[slug]?.ev?.[locale] ?? null;
  const name = locale === "fr" ? set.nameFr : set.nameEn;
  const meta = pageMetadata(locale, "set", {
    slug,
    vars: {
      name,
      ev: ev ? formatMoney(ev.packEv, locale) : locale === "fr" ? "indisponible" : "unavailable",
    },
  });
  return withSeoQuery(meta, localePath(locale, "set", slug), locale);
}
