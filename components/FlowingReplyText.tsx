"use client";

import { useEffect, useRef, useState } from "react";

interface FlowingReplyTextProps {
  text: string;
  isStreaming: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function durationForLength(length: number): number {
  return clamp(800 + length * 6, 800, 1400);
}

export default function FlowingReplyText({ text, isStreaming }: FlowingReplyTextProps) {
  const [revealedChars, setRevealedChars] = useState(0);
  const revealedRef = useRef(0);

  useEffect(() => {
    if (!text) {
      revealedRef.current = 0;
      setRevealedChars(0);
      return;
    }

    let animationId = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const delta = now - last;
      last = now;

      const target = text.length;
      if (revealedRef.current < target) {
        const perMs = isStreaming
          ? 0.24
          : Math.max(target / durationForLength(target), 0.09);
        revealedRef.current = Math.min(target, revealedRef.current + delta * perMs);
        setRevealedChars(revealedRef.current);
      }

      if (revealedRef.current < text.length - 0.01) {
        animationId = window.requestAnimationFrame(tick);
      }
    };

    animationId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationId);
    };
  }, [text, isStreaming]);

  const ratio = text.length === 0 ? 1 : clamp(revealedChars / text.length, 0, 1);
  const revealPercent = ratio * 100;

  return (
    <div className="flowing-reply" aria-live={isStreaming ? "polite" : "off"}>
      <div
        className="flowing-reply__text"
        style={{
          clipPath: `inset(0 ${Math.max(0, 100 - revealPercent)}% 0 0)`
        }}
      >
        {text}
      </div>
      {ratio < 0.999 ? (
        <div className="flowing-reply__wave" style={{ left: `calc(${revealPercent}% - 30px)` }} aria-hidden="true" />
      ) : null}
    </div>
  );
}
