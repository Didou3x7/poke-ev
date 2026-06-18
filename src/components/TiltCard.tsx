"use client";

import { useRef } from "react";
import { m, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";

/**
 * Lightweight pointer-tracked 3D tilt wrapper with a soft glare. Used to bring
 * the set catalog and landing cards to life on hover. Content stays fully
 * visible and untransformed under prefers-reduced-m.
 */
export function TiltCard({
  children,
  className = "",
  max = 7,
  glare = true,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
  glare?: boolean;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 200, damping: 20, mass: 0.3 });
  const sy = useSpring(py, { stiffness: 200, damping: 20, mass: 0.3 });
  const rotateY = useTransform(sx, [0, 1], [-max, max]);
  const rotateX = useTransform(sy, [0, 1], [max, -max]);
  const gx = useTransform(sx, [0, 1], ["0%", "100%"]);
  const gy = useTransform(sy, [0, 1], ["0%", "100%"]);
  const glareBg = useMotionTemplate`radial-gradient(240px circle at ${gx} ${gy}, rgba(255,255,255,0.09), transparent 60%)`;

  if (reduce) return <div className={className}>{children}</div>;

  function onMove(e: React.PointerEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }
  function onLeave() {
    px.set(0.5);
    py.set(0.5);
  }

  return (
    <div className={className} style={{ perspective: 900 }} onPointerMove={onMove} onPointerLeave={onLeave}>
      <m.div
        ref={ref}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative h-full [&>*]:h-full"
      >
        {children}
        {glare ? (
          <m.div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{ background: glareBg }}
          />
        ) : null}
      </m.div>
    </div>
  );
}
