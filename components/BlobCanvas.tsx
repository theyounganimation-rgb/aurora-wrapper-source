"use client";

import { useEffect, useRef } from "react";
import type { PresenceMode } from "@/lib/types";

interface BlobCanvasProps {
  mode: PresenceMode;
  curiosityLevel: number;
  activityLevel: number;
  activityPulse: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function wrapAngleDistance(a: number, b: number): number {
  const delta = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return Math.abs(delta);
}

export default function BlobCanvas({ mode, curiosityLevel, activityLevel, activityPulse }: BlobCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d", {
      alpha: true,
      desynchronized: true
    });

    if (!context) {
      return;
    }

    let width = 0;
    let height = 0;
    let dpr = 1;
    let animationId = 0;
    let lastPulse = activityPulse;
    let pulseBoost = 0;
    let bumpEnvelope = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const render = (time: number) => {
      if (lastPulse !== activityPulse) {
        pulseBoost = 1;
        lastPulse = activityPulse;
      }

      pulseBoost *= 0.92;

      const t = time * 0.001;
      const cx = width * 0.5;
      const cy = height * 0.5;
      const baseRadius = Math.min(width, height) * 0.24;
      const curiosity = clamp(curiosityLevel, 0, 1);
      const activity = clamp(activityLevel, 0, 1);

      const isThinking = mode === "thinking";
      const thinkingTarget = isThinking ? 1 : 0;
      bumpEnvelope += (thinkingTarget - bumpEnvelope) * (isThinking ? 0.08 : 0.06);

      const breathing =
        mode === "heartbeat_recent"
          ? 1 + Math.sin(t * 3.2) * 0.012 + pulseBoost * 0.01
          : mode === "in_conversation"
            ? 1 + Math.sin(t * 1.35) * 0.005 + pulseBoost * 0.004
            : mode === "thinking"
              ? 1 + Math.sin(t * 1.8) * 0.004
              : 1 + Math.sin(t * 0.45) * 0.002;

      const radius = baseRadius * breathing;
      const bumpCenterAngle = (t * (0.85 + activity * 1.7)) % (Math.PI * 2);
      const bumpWidth = 0.44 + curiosity * 0.48;
      const bumpAmp =
        baseRadius *
        (0.07 + activity * 0.08 + curiosity * 0.03) *
        (0.84 + Math.sin(t * 2.9) * 0.16) *
        bumpEnvelope;
      const bumpLevels = 8;
      const bumpStep = bumpAmp > 0 ? bumpAmp / bumpLevels : 0;

      context.clearRect(0, 0, width, height);

      const ambientGlow = context.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius * 1.85);
      ambientGlow.addColorStop(0, `rgba(255, 255, 255, ${0.12 + activity * 0.07})`);
      ambientGlow.addColorStop(0.55, `rgba(142, 194, 255, ${0.06 + pulseBoost * 0.05})`);
      ambientGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.fillStyle = ambientGlow;
      context.fillRect(0, 0, width, height);

      const segments = 220;
      context.beginPath();

      for (let index = 0; index <= segments; index += 1) {
        const ratio = index / segments;
        const angle = ratio * Math.PI * 2;

        let bump = 0;
        if (bumpEnvelope > 0.001) {
          const distance = wrapAngleDistance(angle, bumpCenterAngle);
          if (distance < bumpWidth) {
            const normalized = 1 - distance / bumpWidth;
            const shaped = normalized * normalized * bumpAmp;
            bump = bumpStep > 0 ? Math.round(shaped / bumpStep) * bumpStep : shaped;
          }
        }

        const r = radius + Math.max(0, bump);
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;

        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }

      const fill = context.createRadialGradient(cx, cy - radius * 0.3, radius * 0.25, cx, cy, radius * 1.08);
      fill.addColorStop(0, "rgba(255, 255, 255, 0.99)");
      fill.addColorStop(1, "rgba(242, 246, 255, 0.95)");

      context.fillStyle = fill;
      context.fill();

      context.strokeStyle = `rgba(255, 255, 255, ${0.82 + pulseBoost * 0.1})`;
      context.lineWidth = 1.1;
      context.stroke();

      if (mode === "heartbeat_recent") {
        const ringRadius = radius + 14 + Math.sin(t * 3.2) * 2.2;
        context.beginPath();
        context.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        context.strokeStyle = `rgba(180, 216, 255, ${0.22 + pulseBoost * 0.1})`;
        context.lineWidth = 1;
        context.stroke();
      }

      animationId = window.requestAnimationFrame(render);
    };

    animationId = window.requestAnimationFrame(render);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationId);
    };
  }, [activityLevel, activityPulse, curiosityLevel, mode]);

  return <canvas ref={canvasRef} className="blob-canvas" aria-hidden="true" />;
}
