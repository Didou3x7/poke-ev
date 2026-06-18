"use client";

import { m, useScroll, useSpring } from "motion/react";

/** Thin holo progress bar pinned to the top of the viewport. Transform-only. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.4 });

  return (
    <m.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left"
      style={{ scaleX, background: "var(--holo-gradient)" }}
    />
  );
}
