"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, m, useMotionValue, useMotionTemplate, useReducedMotion, useSpring, useTransform } from "motion/react";
import type { HeroCard } from "@/lib/hero-cards";

/**
 * A single holographic Pokémon card slot: pointer-tracked 3D tilt, a moving
 * iridescent foil and a cursor glare on a persistent frame, while the artwork
 * cross-fades as the pool rotates. Degrades to a clean static card under
 * prefers-reduced-m.
 */
export function HoloCard({
  card,
  src,
  fallbackSrc,
  baseRotate = 0,
  floatDelay = 0,
  eager = false,
  maxTilt = 16,
  className = "",
}: {
  card: HeroCard;
  src: string;
  /** Swapped in via onError when `src` fails (e.g. a locale print that 404s). */
  fallbackSrc?: string;
  baseRotate?: number;
  floatDelay?: number;
  eager?: boolean;
  /** Max pointer-tilt in degrees. 0 = no 3D tilt (card stays flat — used for the
   *  big chase card, where a strong skew reads as "crooked"). */
  maxTilt?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const tiltRef = useRef<HTMLDivElement>(null);

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 140, damping: 18, mass: 0.4 });
  const sy = useSpring(py, { stiffness: 140, damping: 18, mass: 0.4 });

  const rotateY = useTransform(sx, [0, 1], [maxTilt, -maxTilt]);
  const rotateX = useTransform(sy, [0, 1], [-maxTilt, maxTilt]);
  const glareX = useTransform(sx, [0, 1], ["0%", "100%"]);
  const glareY = useTransform(sy, [0, 1], ["0%", "100%"]);
  const foilX = useTransform(sx, [0, 1], ["0%", "100%"]);
  const foilY = useTransform(sy, [0, 1], ["0%", "100%"]);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX} ${glareY}, rgba(255,255,255,0.5), rgba(255,255,255,0.08) 30%, transparent 55%)`;
  const foilPos = useMotionTemplate`${foilX} ${foilY}`;

  function handleMove(e: React.PointerEvent) {
    const el = tiltRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }
  function handleLeave() {
    px.set(0.5);
    py.set(0.5);
  }

  if (reduce) {
    return (
      <div className={className} style={{ transform: `rotate(${baseRotate}deg)` }}>
        <div className="relative overflow-hidden rounded-[18px] ring-1 ring-line-strong">
          <CardImage src={src} name={card.name} eager={eager} fallbackSrc={fallbackSrc} key={card.path} />
        </div>
        <CardLabel name={card.name} tag={card.tag} cardKey={card.path} />
      </div>
    );
  }

  return (
    <div className={className} style={{ perspective: 1100 }}>
      <m.div
        style={{ rotate: baseRotate }}
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: floatDelay }}
      >
        <m.div
          ref={tiltRef}
          onPointerMove={handleMove}
          onPointerLeave={handleLeave}
          style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
          // No opacity in the entrance: the card stays visible even if the
          // animation is paused (backgrounded tab) — only scale/lift animate in.
          initial={{ scale: 0.9, y: 22 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 110, damping: 18, delay: 0.15 + floatDelay }}
          className="relative"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-4 -z-10 rounded-[26px] opacity-35 blur-xl"
            style={{ background: "var(--holo-gradient)" }}
          />
          {/* The card itself is the frame — no backdrop. Its printed border
              fills the window edge-to-edge (aspect matches the 600×825 art), so
              the full card shows, centered, with naturally rounded corners. */}
          <div className="relative aspect-[600/825] overflow-hidden rounded-[11px] shadow-[0_30px_70px_-22px_rgba(0,0,0,0.85)]">
            {/* Soft cross-dissolve: both layers overlap (absolute inset-0) and
                fade through each other; scale stays ≤ 1 so the card never
                exceeds the window. initial={false} → first card shows instantly. */}
            <AnimatePresence initial={false}>
              <m.div
                key={card.path}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 1.0, ease: [0.33, 0, 0.2, 1] }}
                className="absolute inset-0 will-change-[opacity,transform]"
              >
                <CardImage src={src} name={card.name} eager={eager} fallbackSrc={fallbackSrc} />
              </m.div>
            </AnimatePresence>
            <m.div
              aria-hidden
              className="holo-foil pointer-events-none absolute inset-0"
              style={{ backgroundPosition: foilPos }}
            />
            <m.div
              aria-hidden
              className="pointer-events-none absolute inset-0 mix-blend-overlay"
              style={{ background: glare }}
            />
          </div>
        </m.div>
      </m.div>
      <CardLabel name={card.name} tag={card.tag} cardKey={card.path} />
    </div>
  );
}

function CardImage({
  src,
  name,
  eager,
  fallbackSrc,
}: {
  src: string;
  name: string;
  eager?: boolean;
  fallbackSrc?: string;
}) {
  // next/image serves AVIF/WebP at the right DPR for the ~360px hero (faster LCP,
  // sharper). State-based fallback: when a localized print 404s, swap to the EN
  // scan (the pool rotates this component through cards, so re-sync on src change).
  const [imgSrc, setImgSrc] = useState(src);
  useEffect(() => {
    setImgSrc(src);
  }, [src]);
  return (
    <Image
      src={imgSrc}
      alt={name}
      fill
      sizes="(min-width: 1024px) 360px, 80vw"
      priority={eager}
      onError={fallbackSrc ? () => setImgSrc((cur) => (cur === fallbackSrc ? cur : fallbackSrc)) : undefined}
      className="object-contain"
    />
  );
}

function CardLabel({ name, tag, cardKey }: { name: string; tag: string; cardKey?: string }) {
  return (
    <div className="relative mt-3 h-9 text-center">
      <AnimatePresence initial={false}>
        <m.div
          key={cardKey ?? name}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
          className="absolute inset-x-0"
        >
          <p className="font-display text-sm font-semibold tracking-tight">{name}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">{tag}</p>
        </m.div>
      </AnimatePresence>
    </div>
  );
}
