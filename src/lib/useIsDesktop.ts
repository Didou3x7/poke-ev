"use client";

import { useEffect, useState } from "react";

/**
 * True once mounted on a viewport ≥ `min` px. Returns false during SSR and the
 * first client render (so heavy desktop-only widgets don't mount on mobile and
 * there's no hydration mismatch), then updates on mount and on resize.
 */
export function useIsDesktop(min = 1024): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${min}px)`);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [min]);

  return isDesktop;
}
