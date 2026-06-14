import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE } from "@/lib/i18n/config";

/**
 * First-visit language detection, root path only. The browser's language
 * decides where you land: an English browser → /en, anything else → the French
 * root. An explicit choice (the toggle's NEXT_LOCALE cookie) always wins and
 * persists. Crawlers are never redirected (hreflang handles their routing).
 */

const BOT_RE = /bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|whatsapp|telegram/i;

export function middleware(request: NextRequest) {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookie === "en") {
    return NextResponse.redirect(new URL("/en", request.url));
  }
  if (cookie === "fr") {
    return NextResponse.next();
  }
  const ua = request.headers.get("user-agent") ?? "";
  if (BOT_RE.test(ua)) return NextResponse.next();

  const accept = request.headers.get("accept-language") ?? "";
  const first = accept.split(",")[0]?.trim().toLowerCase() ?? "";
  if (first.startsWith("en")) {
    const response = NextResponse.redirect(new URL("/en", request.url));
    response.cookies.set(LOCALE_COOKIE, "en", { path: "/", maxAge: 60 * 60 * 24 * 365 });
    return response;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
