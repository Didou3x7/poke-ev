"use client";

import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { track } from "@/lib/analytics";

/** Instant language switch — sets the cookie then soft-navigates (no reload). */
export function LanguageSwitch({
  targetLocale,
  targetPath,
  label,
}: {
  targetLocale: Locale;
  targetPath: string;
  label: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${targetLocale};path=/;max-age=31536000;samesite=lax`;
        track("Language Switch", { to: targetLocale });
        router.push(targetPath);
      }}
      className="rounded-full border border-line px-3 py-1.5 font-mono text-xs tracking-widest text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
      aria-label={label}
    >
      {targetLocale === "fr" ? "FR" : "EN"}
    </button>
  );
}
