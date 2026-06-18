import type { MetadataRoute } from "next";
import { getAllSets } from "@/lib/data/catalog";
import { getSnapshot } from "@/lib/data/snapshot";
import { cardSitemapSlugs } from "@/lib/view/card-meta";
import { absoluteUrl, alternates, type PageKey } from "@/lib/i18n/config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const snapshot = await getSnapshot();
  const lastModified = new Date(snapshot.generatedAt);
  const staticPages: PageKey[] = ["home", "calculator", "sets", "faq", "legal", "privacy", "cookies"];
  const entries: MetadataRoute.Sitemap = [];

  const push = (
    page: PageKey | "card",
    paths: Record<"fr" | "en", string>,
    priority: number,
    changeFrequency: "daily" | "weekly" | "monthly",
    dated: boolean,
  ) => {
    for (const locale of ["fr", "en"] as const) {
      entries.push({
        url: absoluteUrl(paths[locale]),
        changeFrequency,
        priority,
        ...(dated ? { lastModified } : {}),
        alternates: { languages: { fr: absoluteUrl(paths.fr), en: absoluteUrl(paths.en) } },
      });
    }
  };

  for (const page of staticPages) {
    const priority = page === "home" ? 1 : page === "calculator" ? 0.9 : page === "sets" ? 0.8 : page === "faq" ? 0.6 : 0.3;
    const daily = page === "home" || page === "calculator" || page === "sets";
    const isLegal = page === "legal" || page === "privacy" || page === "cookies";
    push(page, alternates(page), priority, daily ? "daily" : "weekly", !isLegal);
  }
  for (const set of getAllSets()) {
    push("set", alternates("set", set.id), 0.6, "daily", true);
  }
  // Long-tail: a price page per collectible card (top cards of every set).
  for (const slug of await cardSitemapSlugs()) {
    push("card", { fr: `/cartes/${slug}`, en: `/en/cards/${slug}` }, 0.5, "daily", true);
  }
  return entries;
}
