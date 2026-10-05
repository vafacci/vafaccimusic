"use client";

import { useEffect, useRef, useState } from "react";
import { useAudioStore } from "@/experience/audio/audioStore";

type SeekBarProps = {
  className?: string;
  disabled?: boolean;
  /** Live time labels under the bar (current / remaining). */
  showTimes?: boolean;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Touch-first seek scrubber — tall hit area, pointer capture, rAF-smooth fill.
 * Native range inputs feel sticky and tiny on mobile.
 */
export function SeekBar({
  className = "",
  disabled = false,
  showTimes = false,
}: SeekBarProps) {
  const engine = useAudioStore((s) => s.engine);
  const seek = useAudioStore((s) => s.seek);
  const status = useAudioStore((s) => s.status);

  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const currentLabelRef = useRef<HTMLSpanElement>(null);
  const remainLabelRef = useRef<HTMLSpanElement>(null);

  const draggingRef = useRef(false);
  const ratioRef = useRef(0);
  const durationRef = useRef(0);
  const lastSeekAtRef = useRef(0);

  const [dragging, setDragging] = useState(false);

  const canUse =
    !disabled &&
    (status === "playing" || status === "ready" || status === "loading");

  function applyVisual(ratio: number, duration: number) {
    const clamped = Math.min(1, Math.max(0, ratio));
    const pct = `${clamped * 100}%`;
    if (fillRef.current) fillRef.current.style.width = pct;
    if (thumbRef.current) thumbRef.current.style.left = pct;

    if (!showTimes) return;
    const t = clamped * duration;
    if (currentLabelRef.current) {
      currentLabelRef.current.textContent = formatTime(t);
    }
    if (remainLabelRef.current) {
      remainLabelRef.current.textContent = `-${formatTime(
        Math.max(0, duration - t),
      )}`;
    }
  }

  function ratioFromClientX(clientX: number): number {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function scrubTo(clientX: number, opts: { commit: boolean; force?: boolean }) {
    const duration = durationRef.current;
    if (!(duration > 0)) return;
    const ratio = ratioFromClientX(clientX);
    ratioRef.current = ratio;
    applyVisual(ratio, duration);

    if (!opts.commit) return;
    const now = performance.now();
    if (!opts.force && now - lastSeekAtRef.current < 32) return;
    lastSeekAtRef.current = now;
    seek(ratio * duration);
  }

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const duration = engine.getDuration();
      durationRef.current = Number.isFinite(duration) ? duration : 0;

      if (!draggingRef.current) {
        const t = engine.getCurrentTime();
        const ratio =
          durationRef.current > 0
            ? Math.min(1, Math.max(0, t / durationRef.current))
            : 0;
        ratioRef.current = ratio;
        applyVisual(ratio, durationRef.current);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, showTimes]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!canUse) return;
    e.preventDefault();
    durationRef.current = engine.getDuration();
    if (!(durationRef.current > 0)) return;

    draggingRef.current = true;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubTo(e.clientX, { commit: true, force: true });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    e.preventDefault();
    scrubTo(e.clientX, { commit: true });
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    e.preventDefault();
    scrubTo(e.clientX, { commit: true, force: true });
    draggingRef.current = false;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
  }

  return (
    <div className={`seek-bar ${className}`.trim()}>
      <div
        ref={trackRef}
        className={`seek-bar__hit${dragging ? " is-dragging" : ""}${!canUse ? " is-disabled" : ""}`}
        role="slider"
        tabIndex={canUse ? 0 : -1}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratioRef.current * 100)}
        aria-disabled={!canUse}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(e) => {
          if (!canUse) return;
          const duration = engine.getDuration();
          if (!(duration > 0)) return;
          const step = e.shiftKey ? 10 : 5;
          let next = engine.getCurrentTime();
          if (e.key === "ArrowRight" || e.key === "ArrowUp") next += step;
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next -= step;
          else if (e.key === "Home") next = 0;
          else if (e.key === "End") next = duration;
          else return;
          e.preventDefault();
          seek(Math.min(duration, Math.max(0, next)));
        }}
      >
        <div className="seek-bar__track">
          <div ref={fillRef} className="seek-bar__fill" />
          <div ref={thumbRef} className="seek-bar__thumb" />
        </div>
      </div>

      {showTimes ? (
        <div className="seek-bar__times">
          <span ref={currentLabelRef}>0:00</span>
          <span ref={remainLabelRef}>-0:00</span>
        </div>
      ) : null}
    </div>
  );
}
