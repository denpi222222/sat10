'use client';

import React, { useEffect, useRef, useState } from 'react';

type NeonTitleProps = {
  title: string;
  subtitle?: string;
};

/**
 * NeonTitle renders a neon-glowing title with occasional flicker effect.
 * On each flicker it dispatches a global custom event 'crazycube:spark-burst'
 * with the screen coordinates of the title center to trigger spark rain.
 */
export function NeonTitle({ title, subtitle }: NeonTitleProps) {
  const [isFlickering, setIsFlickering] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const scheduleFlicker = () => {
      const nextInMs = 2000 + Math.random() * 2000; // 2-4s
      timer = window.setTimeout(() => {
        setIsFlickering(true);
        // Emit spark burst event with element center coordinates
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const detail = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
          window.dispatchEvent(
            new CustomEvent('crazycube:spark-burst', { detail })
          );
        }
        // End flicker quickly for a realistic short-circuit effect
        window.setTimeout(() => setIsFlickering(false), 220 + Math.random() * 180);
        scheduleFlicker();
      }, nextInMs) as unknown as number;
    };
    scheduleFlicker();
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative z-10 text-center select-none">
      <h1
        className={
          'mx-auto uppercase font-extrabold tracking-[0.2em] ' +
          'text-3xl md:text-5xl lg:text-7xl crazycube-neon-title ' +
          (isFlickering ? ' crazycube-neon-flicker' : '')
        }
      >
        {title}
      </h1>
      {subtitle ? (
        <div className="mt-1 text-[11px] md:text-base lg:text-lg crazycube-neon-subtitle">
          {subtitle}
        </div>
      ) : null}

      <style jsx>{`
        .crazycube-neon-title {
          color: #a6e8ff;
          text-shadow:
            0 0 8px rgba(34, 211, 238, 0.9),
            0 0 18px rgba(14, 165, 233, 0.8),
            0 0 42px rgba(59, 130, 246, 0.7),
            0 0 82px rgba(14, 165, 233, 0.6);
          filter: saturate(1.2) brightness(1.06);
          transition: filter 120ms ease, transform 120ms ease, letter-spacing 120ms ease;
        }
        .crazycube-neon-subtitle {
          color: rgba(186, 230, 253, 0.9);
          text-shadow:
            0 0 6px rgba(34, 211, 238, 0.7),
            0 0 14px rgba(14, 165, 233, 0.7);
        }
        .crazycube-neon-flicker {
          animation: crazycubeFlicker 0.28s linear 0s 1;
        }
        @keyframes crazycubeFlicker {
          0% { filter: brightness(0.6) saturate(0.9); letter-spacing: 0.18em; transform: translateY(0); }
          20% { filter: brightness(1.4) saturate(1.6); letter-spacing: 0.22em; transform: translateY(-1px); }
          40% { filter: brightness(0.8) saturate(1.0); letter-spacing: 0.2em; transform: translateY(0); }
          60% { filter: brightness(1.8) saturate(1.8); letter-spacing: 0.25em; transform: translateY(-1px); }
          80% { filter: brightness(0.7) saturate(1.0); letter-spacing: 0.19em; transform: translateY(0); }
          100% { filter: brightness(1.1) saturate(1.3); letter-spacing: 0.2em; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}


