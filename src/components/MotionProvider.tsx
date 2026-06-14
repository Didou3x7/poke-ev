"use client";

import { MotionConfig } from "motion/react";

/**
 * Makes every Framer Motion animation honor the OS "reduce motion" setting
 * (WCAG 2.3.3). `reducedMotion="user"` keeps opacity changes but drops
 * transforms/large movement when the user asks for it.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
