import type { MetadataRoute } from "next";
import { getAllSets } from "@/lib/data/catalog";
import { absoluteUrl, alternates, type PageKey } from "@/lib/i18n/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: PageKey[] = ["home", "calculator", "sets", "faq", "legal", "privacy", "cookies"];
  const entries: MetadataRoute.Sitemap = [];

  const push = (page: PageKey, slug?: string, priority = 0.7, changeFrequency: "daily" | "weekly" | "monthly" = "weekly") => {
    const alt = alternates(page, slug);
    for (const locale of ["fr", "en"] as const) {
      entries.push({
        url: absoluteUrl(alt[locale]),
        changeFrequency,
        priority,
        alternates: {
          languages: { fr: absoluteUrl(alt.fr), en: absoluteUrl(alt.en) },
        },
      });
    }
  };

  for (const page of staticPages) {
    const priority = page === "home" ? 1 : page === "calculator" ? 0.9 : page === "sets" ? 0.8 : page === "faq" ? 0.6 : 0.3;
    push(page, undefined, priority, page === "home" || page === "calculator" ? "daily" : "weekly");
  }
  for (const set of getAllSets()) {
    push("set", set.id, 0.6, "daily");
  }
  return entries;
}
