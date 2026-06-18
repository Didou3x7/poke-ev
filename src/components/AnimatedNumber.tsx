"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useMotionValue, useReducedMotion, useTransform, m } from "motion/react";

/** Server-safe integer counter (no function props across the RSC boundary). */
export function AnimatedInt({
  value,
  locale,
  className,
}: {
  value: number;
  locale: string;
  className?: string;
}) {
  return (
    <AnimatedNumber
      value={value}
      format={(n) => Math.round(n).toLocaleString(locale)}
      className={className}
    />
  );
}

/** Counter that rolls from 0 to `value` — the EV reveal moment. */
export function AnimatedNumber({
  value,
  format,
  className,
  duration = 0.9,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(reduceMotion ? value : 0);
  const text = useTransform(motionValue, (latest) => format(latest));
  // Safety net: if the element never registers as "in view" (observer race for
  // above-the-fold items), roll up anyway after a short delay so the final
  // value is always reached. Never leaves the counter stuck at 0.
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (inView) {
      setArmed(true);
      return;
    }
    const t = setTimeout(() => setArmed(true), 350);
    return () => clearTimeout(t);
  }, [inView]);

  useEffect(() => {
    if (!armed) return;
    // Honor "reduce motion": jump straight to the final value, no roll-up.
    if (reduceMotion) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
  }, [armed, value, duration, motionValue, reduceMotion]);

  return (
    <span ref={ref} className={className}>
      <m.span className="tnum">{text}</m.span>
    </span>
  );
}
