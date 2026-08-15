import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface CardNameTooltipProps {
  name: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
}

/**
 * Wraps a card thumbnail and shows the card's name in a small pill on hover.
 * The pill is rendered through a React portal to document.body so it is always
 * on the top-most layer and is never clipped by overflow-hidden parents
 * (Deck Spotlight cell, Fun Facts cells, Deck Library table, etc.).
 */
export function CardNameTooltip({ name, children, position = 'top' }: CardNameTooltipProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  const show = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({
      x: r.left + r.width / 2,
      y: position === 'top' ? r.top : r.bottom,
    });
  }, [position]);

  const hide = useCallback(() => setAnchor(null), []);

  // Keep the pill on-screen after it's rendered.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip || !anchor) return;
    const tw = tip.offsetWidth;
    const left = Math.max(8, Math.min(anchor.x - tw / 2, window.innerWidth - tw - 8));
    tip.style.left = `${left}px`;
    tip.style.top = `${anchor.y}px`;
  }, [anchor]);

  return (
    <div ref={wrapRef} onMouseEnter={show} onMouseLeave={hide} className="relative">
      {children}
      {anchor &&
        createPortal(
          <div
            ref={tipRef}
            className={`pointer-events-none fixed z-[9999] px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold whitespace-nowrap bg-black/95 border border-white/20 text-white shadow-2xl ${
              position === 'top' ? '-translate-y-full -mt-2' : 'mt-2'
            }`}
            style={{ left: anchor.x, top: anchor.y }}
            role="tooltip"
          >
            {name}
          </div>,
          document.body
        )}
    </div>
  );
}
