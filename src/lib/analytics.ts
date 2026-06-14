"use client";

/** Umami custom events. No-ops when analytics isn't loaded (e.g. local dev). */

type EventName =
  | "Calculation"
  | "Verdict"
  | "Set Viewed"
  | "Share"
  | "Language Switch";

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, string | number>) => void };
  }
}

export function track(event: EventName, props?: Record<string, string | number>): void {
  if (typeof window !== "undefined" && typeof window.umami?.track === "function") {
    window.umami.track(event, props);
  }
}
