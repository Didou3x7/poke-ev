"use client";

import { HoloCard } from "@/components/hero/HoloCard";

/**
 * Showcase for a set's chase card — its single most valuable card — rendered in
 * the exact holographic style of the hero cards (tilt, foil, glare, float).
 * The image is the locale print (FR on the FR site); `imageEn` is swapped in via
 * HoloCard's onError when a French scan is missing. Used on the calculator (once
 * a set is picked) and at the top of each set page.
 */
export function ChaseCard({
  name,
  image,
  imageEn,
  setName,
  eyebrow,
  value,
  eager = false,
  className = "",
}: {
  name: string;
  image: string;
  imageEn: string;
  setName: string;
  eyebrow: string;
  /** Pre-formatted market price string (already localized), shown under the card. */
  value?: string;
  eager?: boolean;
  className?: string;
}) {
  return (
    <figure className={`flex flex-col items-center ${className}`}>
      <figcaption className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-fg-faint">
        ✦ {eyebrow}
      </figcaption>
      <HoloCard
        card={{ path: image, name, tag: setName }}
        src={image}
        fallbackSrc={imageEn}
        baseRotate={0}
        eager={eager}
        className="w-[200px] sm:w-[220px]"
      />
      {value ? <p className="mt-1.5 font-mono text-xs text-fg-muted tnum">{value}</p> : null}
    </figure>
  );
}
