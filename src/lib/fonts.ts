import localFont from "next/font/local";

/** Self-hosted fonts — Clash Display (display), Satoshi (text), JetBrains Mono (data). */

export const clashDisplay = localFont({
  src: [
    { path: "../../public/fonts/clash-display-500.woff2", weight: "500" },
    { path: "../../public/fonts/clash-display-600.woff2", weight: "600" },
    { path: "../../public/fonts/clash-display-700.woff2", weight: "700" },
  ],
  variable: "--font-clash",
  display: "swap",
});

export const satoshi = localFont({
  src: [
    { path: "../../public/fonts/satoshi-400.woff2", weight: "400" },
    { path: "../../public/fonts/satoshi-500.woff2", weight: "500" },
    { path: "../../public/fonts/satoshi-700.woff2", weight: "700" },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

export const jetbrainsMono = localFont({
  src: [{ path: "../../public/fonts/jetbrains-mono-latin.woff2", weight: "500" }],
  variable: "--font-jbmono",
  display: "swap",
});

export const fontVariables = `${clashDisplay.variable} ${satoshi.variable} ${jetbrainsMono.variable}`;
