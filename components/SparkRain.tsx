'use client';

import React, { useEffect, useRef, useState } from 'react';

type Spark = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // seconds
  size: number;
  hue: number;
};

type SparkRainProps = {
  className?: string;
  enabled?: boolean;
};

/** Canvas spark rain that reacts to 'crazycube:spark-burst' events. */
export function SparkRain({ className = '', enabled = true }: SparkRainProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isClient, setIsClient] = useState(false);
  const sparksRef = useRef<Spark[]>([]);
  const lastTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    setIsClient(true);
    const onResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onBurst = (e: Event) => {
      const { detail } = e as CustomEvent<{ x: number; y: number }>;
      const x = detail?.x ?? window.innerWidth / 2;
      const y = detail?.y ?? window.innerHeight * 0.2;
      emitSparks(x, y);
    };
    window.addEventListener('crazycube:spark-burst', onBurst as EventListener);
    return () => window.removeEventListener('crazycube:spark-burst', onBurst as EventListener);
  }, [enabled]);

  const emitSparks = (x: number, y: number) => {
    const count = 80 + Math.floor(Math.random() * 80);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 220;
      sparksRef.current.push({
        id: Math.random(),
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 100,
        life: 0.8 + Math.random() * 0.8,
        size: 1 + Math.random() * 2.2,
        hue: 180 + Math.random() * 120, // cyan/blue/purple
      });
    }
  };

  useEffect(() => {
    if (!isClient || !enabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const gravity = 480; // px/s^2
    const fade = 1.2; // fade multiplier

    const loop = (t: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = t;
      const dt = Math.min((t - lastTimeRef.current) / 1000, 0.033);
      lastTimeRef.current = t;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';

      const next: Spark[] = [];
      for (const s of sparksRef.current) {
        // integrate
        const nx = s.x + s.vx * dt;
        const ny = s.y + s.vy * dt;
        const nvy = s.vy + gravity * dt;
        const nlife = s.life - dt * fade;
        if (nlife > 0 && ny < canvas.height + 20) {
          next.push({ ...s, x: nx, y: ny, vy: nvy, life: nlife });
          // draw
          const alpha = Math.max(0, Math.min(1, nlife));
          ctx.beginPath();
          ctx.fillStyle = `hsla(${s.hue}, 90%, 60%, ${alpha})`;
          ctx.shadowColor = `hsla(${s.hue}, 90%, 70%, ${alpha})`;
          ctx.shadowBlur = 8;
          ctx.arc(nx, ny, s.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      sparksRef.current = next;
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isClient, enabled]);

  if (!isClient || !enabled) return null;
  return <canvas ref={canvasRef} className={`pointer-events-none fixed inset-0 z-[5] ${className}`} />;
}


