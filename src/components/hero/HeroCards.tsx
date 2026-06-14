"use client";

import { useEffect, useSyncExternalStore } from "react";
import { heroCardImage, heroPoolImages, heroTracks, type HeroCard } from "@/lib/hero-cards";
import { useIsDesktop } from "@/lib/useIsDesktop";
import type { Locale } from "@/lib/i18n/config";
import { HoloCard } from "./HoloCard";

/**
 * Iconic cards flanking the hero title. Rendered ONLY on desktop (≥1024px) so
 * the heavy holo widgets never mount on phones — the mobile hero stays fast and
 * content-first.
 *
 * A single shared clock drives both sides: it ticks every HALF_PERIOD, and a
 * side only advances on ticks matching its parity. So the left and right cards
 * alternate (one swaps, then the other ~HALF_PERIOD later) and can never change
 * on the same beat — no matter how the browser throttles timers.
 */

const HALF_PERIOD = 2600; // a side swaps every 2×HALF_PERIOD (~5.2s); sides alternate every HALF_PERIOD

let sharedTick = 0;
let clockTimer: ReturnType<typeof setInterval> | null = null;
const subscribers = new Set<() => void>();

function ensureClock() {
  if (clockTimer) return;
  clockTimer = setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return; // don't rotate unseen
    sharedTick += 1;
    subscribers.forEach((fn) => fn());
  }, HALF_PERIOD);
}

/** useSyncExternalStore wiring: a single shared tick counter. */
function subscribeClock(onChange: () => void): () => void {
  subscribers.add(onChange);
  ensureClock();
  return () => {
    subscribers.delete(onChange);
    if (subscribers.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}
const getTick = () => sharedTick;
const getServerTick = () => 0;

// Preload + decode the whole pool once, so card swaps are instant (no on-demand
// fetch/decode hitch when a new card mounts). Runs once per locale.
const preloaded = new Set<string>();
function preloadPool(locale: Locale) {
  if (typeof window === "undefined" || preloaded.has(locale)) return;
  preloaded.add(locale);
  for (const url of heroPoolImages(locale)) {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    img.decode?.().catch(() => {});
  }
}

export function HeroCardSlot({
  locale,
  side,
  className = "",
}: {
  locale: Locale;
  side: "left" | "right";
  className?: string;
}) {
  const isDesktop = useIsDesktop();
  const { left, right } = heroTracks(locale);
  const track = side === "left" ? left : right;

  useEffect(() => {
    if (isDesktop) preloadPool(locale);
  }, [isDesktop, locale]);

  if (!isDesktop) return null;

  return (
    <div className={className}>
      <RotatingCard
        locale={locale}
        track={track}
        side={side}
        baseRotate={0}
        floatDelay={side === "left" ? 0 : 0.7}
      />
    </div>
  );
}

function RotatingCard({
  locale,
  track,
  side,
  baseRotate,
  floatDelay,
}: {
  locale: Locale;
  track: HeroCard[];
  side: "left" | "right";
  baseRotate: number;
  floatDelay: number;
}) {
  const tick = useSyncExternalStore(subscribeClock, getTick, getServerTick);

  // Index is DERIVED from the single shared tick (no per-card mutable state, so
  // a side can never double-advance). Left changes on even ticks (2,4,6…), right
  // on odd ticks (1,3,5…): they strictly alternate and never swap together.
  const step = side === "left" ? Math.floor(tick / 2) : Math.floor((tick + 1) / 2);
  const i = track.length > 0 ? step % track.length : 0;
  const card = track[i] ?? track[0];
  if (!card) return null;

  return (
    <HoloCard
      card={card}
      src={heroCardImage(locale, card)}
      baseRotate={baseRotate}
      floatDelay={floatDelay}
      eager={tick === 0}
      className="w-[210px] xl:w-[236px]"
    />
  );
}
