"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type MutableRefObject
} from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

interface Burst {
  particles: Particle[];
  createdAt: number;
  duration: number;
}

interface SpawnParams {
  text: string;
  sourceRect: DOMRect;
  font: string;
  color: string;
}

export interface SendDissipateHandle {
  spawn: (params: SpawnParams) => void;
}

const MAX_PARTICLES = 1500;

function makeParticle(px: number, py: number): Particle {
  const angle = (-Math.PI / 2) + (Math.random() - 0.5) * 1.1;
  const force = 1.2 + Math.random() * 2.6;

  return {
    x: px,
    y: py,
    vx: Math.cos(angle) * force + (Math.random() - 0.5) * 0.8,
    vy: Math.sin(angle) * force - Math.random() * 0.2,
    size: 0.8 + Math.random() * 2,
    alpha: 0.55 + Math.random() * 0.4
  };
}

function spawnFromText(params: SpawnParams): Burst {
  const text = params.text.trim();
  if (!text) {
    return {
      particles: [],
      createdAt: performance.now(),
      duration: 700
    };
  }

  const measurementCanvas = document.createElement("canvas");
  const measurementContext = measurementCanvas.getContext("2d");
  if (!measurementContext) {
    return {
      particles: [],
      createdAt: performance.now(),
      duration: 700
    };
  }

  measurementContext.font = params.font;
  const measured = measurementContext.measureText(text);
  const width = Math.max(20, Math.ceil(measured.width + 18));
  const height = Math.max(18, Math.ceil((measured.actualBoundingBoxAscent || 11) + (measured.actualBoundingBoxDescent || 5) + 8));

  measurementCanvas.width = width;
  measurementCanvas.height = height;

  measurementContext.clearRect(0, 0, width, height);
  measurementContext.font = params.font;
  measurementContext.fillStyle = "#ffffff";
  measurementContext.textBaseline = "middle";
  measurementContext.fillText(text, 4, height * 0.5);

  const image = measurementContext.getImageData(0, 0, width, height);
  const particles: Particle[] = [];
  const step = width > 460 ? 4 : 3;
  const originX = params.sourceRect.left + 16;
  const originY = params.sourceRect.top + params.sourceRect.height * 0.5 - height * 0.5;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (particles.length >= MAX_PARTICLES) {
        break;
      }

      const alpha = image.data[(y * width + x) * 4 + 3];
      if (alpha < 100) {
        continue;
      }

      particles.push(makeParticle(originX + x, originY + y));
    }

    if (particles.length >= MAX_PARTICLES) {
      break;
    }
  }

  return {
    particles,
    createdAt: performance.now(),
    duration: 700 + Math.random() * 170
  };
}

function drawBursts(
  canvas: HTMLCanvasElement,
  burstsRef: MutableRefObject<Burst[]>,
  rafRef: MutableRefObject<number | null>
) {
  const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!context) {
    rafRef.current = null;
    return;
  }

  const frame = (now: number) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    context.clearRect(0, 0, width, height);

    const remaining: Burst[] = [];

    for (const burst of burstsRef.current) {
      const age = now - burst.createdAt;
      const progress = age / burst.duration;
      if (progress >= 1) {
        continue;
      }

      const fade = 1 - progress;
      for (const particle of burst.particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.989;
        particle.vy += 0.015 + (Math.random() - 0.5) * 0.03;

        const alpha = particle.alpha * fade;
        if (alpha <= 0.01) {
          continue;
        }

        context.fillStyle = `rgba(183, 227, 255, ${alpha})`;
        context.fillRect(particle.x, particle.y, particle.size, particle.size);
      }

      remaining.push(burst);
    }

    burstsRef.current = remaining;

    if (burstsRef.current.length === 0) {
      rafRef.current = null;
      return;
    }

    rafRef.current = window.requestAnimationFrame(frame);
  };

  rafRef.current = window.requestAnimationFrame(frame);
}

const SendDissipateCanvas = forwardRef<SendDissipateHandle>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const burstsRef = useRef<Burst[]>([]);
  const rafRef = useRef<number | null>(null);
  const cancelCurrentFrame = useCallback(() => {
    const rafId = rafRef.current;
    if (rafId === null) {
      return;
    }

    window.cancelAnimationFrame(rafId);
    rafRef.current = null;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      spawn: (params) => {
        const canvas = canvasRef.current;
        if (!canvas) {
          return;
        }

        const burst = spawnFromText(params);
        if (burst.particles.length === 0) {
          return;
        }

        burstsRef.current = [...burstsRef.current, burst];

        if (rafRef.current === null) {
          drawBursts(canvas, burstsRef, rafRef);
        }
      }
    }),
    []
  );

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
      const context = canvas.getContext("2d");
      if (context) {
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelCurrentFrame();
    };
  }, [cancelCurrentFrame]);

  return <canvas className="dissipate-canvas" ref={canvasRef} aria-hidden="true" />;
});

SendDissipateCanvas.displayName = "SendDissipateCanvas";

export default SendDissipateCanvas;
