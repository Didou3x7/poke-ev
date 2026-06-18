"use client";

import { m, useReducedMotion } from "motion/react";

/**
 * Route-change transition. App Router remounts template.tsx on every
 * navigation, so this gives a quick, premium fade-and-lift between pages.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </m.div>
  );
}
