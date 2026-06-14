import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE } from "@/lib/i18n/config";

/**
 * Root path only. Everyone lands in French by default — no browser-language
 * detection. Only visitors who explicitly switched to English (the language
 * toggle sets the NEXT_LOCALE cookie) are redirected to /en; their choice
 * persists across visits.
 */

export function middleware(request: NextRequest) {
  if (request.cookies.get(LOCALE_COOKIE)?.value === "en") {
    return NextResponse.redirect(new URL("/en", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
