import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The /data datasets are read with fs at runtime — make sure Vercel traces them.
  outputFileTracingIncludes: {
    "/**": ["./data/**/*"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.pokemontcg.io" },
      { protocol: "https", hostname: "static.tcggo.com" },
      { protocol: "https", hostname: "*.tcggo.com" },
    ],
  },
  async headers() {
    // CSP only in production — `next dev` HMR needs 'unsafe-eval'. Covers the
    // site's real origins: card art (tcgdex / pokemontcg), cookieless umami
    // analytics. 'unsafe-inline' for script/style is required (Next hydration +
    // Tailwind/motion inline styles, no nonce pipeline).
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' https://cloud.umami.is",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://assets.tcgdex.net https://images.pokemontcg.io https://*.tcggo.com",
      "font-src 'self' data:",
      "connect-src 'self' https://cloud.umami.is https://*.umami.is",
      "manifest-src 'self'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          ...(isProd ? [{ key: "Content-Security-Policy", value: csp }] : []),
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The app uses no device APIs — deny them all to shrink the attack surface.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
          // HSTS ONLY in production (Vercel = HTTPS). Never on http://localhost:
          // it would force Safari/Chrome to https://localhost for 2 years and
          // break local dev (no TLS).
          ...(isProd
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
      {
        source: "/data/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
