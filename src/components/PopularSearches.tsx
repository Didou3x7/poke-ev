import Link from "next/link";
import { type Locale } from "@/lib/i18n/config";
import { readSeoTargets } from "@/lib/ops/seo-targets";

/**
 * "Popular searches" internal-links module — rendered on high-authority pages (home, trends) to
 * flow link equity toward the pages ranking just off page 1, using each page's REAL Search
 * Console query as the anchor text (a strong, honest relevance signal). Populated weekly by the
 * SEO autopilot cron. Renders nothing until there's data, so it never shows an empty box.
 */
export async function PopularSearches({ locale }: { locale: Locale }) {
  const { items } = await readSeoTargets();
  const isEn = (p: string) => p === "/en" || p.startsWith("/en/");
  const forLocale = items.filter((i) => (locale === "en" ? isEn(i.path) : !isEn(i.path)));
  const shown = (forLocale.length ? forLocale : items).slice(0, 12);
  if (shown.length === 0) return null;

  const title = locale === "fr" ? "Recherches populaires" : "Popular searches";

  return (
    <section aria-label={title} className="mx-auto max-w-5xl px-4 py-10">
      <h2 className="font-display text-lg font-semibold tracking-tight text-fg-muted">{title}</h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {shown.map((i) => (
          <li key={i.path + i.query}>
            <Link
              href={i.path}
              className="inline-block rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              {i.query}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
