import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/i18n/config";

export default function robots(): MetadataRoute.Robots {
  return {
    // Allow the dynamic OG image route so social/rich-result crawlers can fetch
    // card/set preview images; everything else under /api stays disallowed.
    rules: [{ userAgent: "*", allow: ["/", "/api/og"], disallow: ["/api/"] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
