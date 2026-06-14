import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/lib/fonts";
import { SITE_URL } from "@/lib/i18n/config";
import { MotionProvider } from "@/components/MotionProvider";
import { GrainOverlay } from "@/components/chrome/GrainOverlay";
import { ScrollProgress } from "@/components/chrome/ScrollProgress";
import "./globals.css";

/**
 * Root layout. FR lives at the root so <html lang> defaults to "fr";
 * the /en segment swaps it client-side after hydration (see en/layout.tsx) —
 * hreflang + og:locale carry the signal for crawlers, and pages stay static.
 */

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Poké EV",
  authors: [{ name: "Poké EV" }],
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0B0E14",
  width: "device-width",
  initialScale: 1,
};

// The Umami website ID is public (it ships in the page), so we default to the
// real one — prod just works with no env step; override via env if it changes.
const UMAMI_WEBSITE_ID =
  process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? "252b0710-eb89-4903-822e-c14c6d43fae2";
// Umami Cloud by default; override for self-host or the EU endpoint.
const UMAMI_SRC = process.env.NEXT_PUBLIC_UMAMI_SRC ?? "https://cloud.umami.is/script.js";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={fontVariables}>
      <head>
        {/* Iconic hero card artwork is served from TCGdex's localized CDN.
            No crossOrigin: the card <img>/preloads load non-CORS, so the warmed
            connection must be non-CORS too or it can't be reused. */}
        <link rel="preconnect" href="https://assets.tcgdex.net" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Poké EV",
              url: SITE_URL,
              logo: `${SITE_URL}/pwa-512.png`,
              description: "Le terminal d'Expected Value des produits scellés Pokémon TCG.",
            }),
          }}
        />
        {UMAMI_WEBSITE_ID ? (
          // Cookieless, GDPR-exempt analytics, no consent banner needed.
          // data-domains keeps localhost/preview traffic out of the stats.
          // Preconnect warms the cross-origin handshake for the deferred script.
          <>
            <link rel="preconnect" href={new URL(UMAMI_SRC).origin} />
            <script
              defer
              data-website-id={UMAMI_WEBSITE_ID}
              data-domains="pokeev.com,www.pokeev.com"
              src={UMAMI_SRC}
            />
          </>
        ) : null}
      </head>
      <body className="min-h-screen antialiased">
        <GrainOverlay />
        <ScrollProgress />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
