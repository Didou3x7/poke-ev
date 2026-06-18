"use client";

import { LazyMotion, MotionConfig } from "motion/react";

/**
 * LazyMotion defers the animation feature bundle off the critical path: pages
 * ship the tiny `m` components, and `domMax` (needed for the calculator's
 * shared-layout `layoutId` pill) is fetched asynchronously after first paint —
 * lighter initial JS / better TBT. `strict` makes a stray full `motion.*` throw,
 * guarding against re-introducing the heavy import.
 *
 * MotionConfig keeps every animation honouring the OS "reduce motion" setting
 * (WCAG 2.3.3): `reducedMotion="user"` keeps opacity but drops large movement.
 */
const loadFeatures = () => import("motion/react").then((mod) => mod.domMax);

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
