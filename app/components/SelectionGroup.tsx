"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Content sized controls share a moving selection surface. Motion remains interruptible. */
export function SelectionGroup({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const previous = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const animation = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const element = root.current, surface = pill.current;
    if (!element || !surface) return;
    const place = () => {
      const selected = element.querySelector<HTMLElement>('button.active');
      if (!selected) { surface.hidden = true; previous.current = null; return; }
      surface.hidden = false;
      const next = { x: selected.offsetLeft, y: selected.offsetTop, width: selected.offsetWidth, height: selected.offsetHeight };
      const last = previous.current;
      Object.assign(surface.style, { left: `${next.x}px`, top: `${next.y}px`, width: `${next.width}px`, height: `${next.height}px` });
      animation.current?.cancel();
      if (last && last.width && next.width && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        animation.current = surface.animate([
          { transform: `translate(${last.x - next.x}px,${last.y - next.y}px) scale(${last.width / next.width},${last.height / next.height})` },
          { transform: 'translate(0,0) scale(1,1)' },
        ], { duration: 240, easing: 'ease-in-out' });
      }
      previous.current = next;
    };
    place();
    const observer = new ResizeObserver(place); observer.observe(element);
    return () => { observer.disconnect(); animation.current?.cancel(); };
  }, [children]);
  return <div ref={root} className={`selectionGroup ${className}`} aria-label={label}><span ref={pill} className="selectionPill" aria-hidden="true"/>{children}</div>;
}
