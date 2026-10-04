"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useAudioStore } from "@/experience/audio/audioStore";
import { shareStoryFrame } from "./shareFrame";
import { ShowTitle } from "./ShowTitle";

const SILVER = "#c5cad3";
const SILVER_DIM = "rgba(197, 202, 211, 0.35)";
const SILVER_SOFT = "rgba(197, 202, 211, 0.7)";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function IconPrev() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M18.5 6.5v11L9 12l9.5-5.5zM6.5 6.5v11"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconNext() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5.5 6.5v11L15 12 5.5 6.5zM17.5 6.5v11"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 7.5v9l8-4.5-8-4.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPause() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 7h2.2v10H8V7zM13.8 7H16v10h-2.2V7z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v11M8 12l4 4 4-4M5 19h14"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShare() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="18" cy="5" r="2.25" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="6" cy="12" r="2.25" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="18" cy="19" r="2.25" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8.2 13.1l7.5 4.3M15.7 6.6l-7.5 4.3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * TikTok-style chrome — vertical controls on the right, seek along the bottom.
 */
export function PlayerFooter() {
  const status = useAudioStore((s) => s.status);
  const error = useAudioStore((s) => s.error);
  const play = useAudioStore((s) => s.play);
  const pause = useAudioStore((s) => s.pause);
  const seek = useAudioStore((s) => s.seek);
  const engine = useAudioStore((s) => s.engine);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const isPlaying = status === "playing";
  const canControl = status === "ready" || status === "playing";
  const remaining = Math.max(duration - currentTime, 0);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  useEffect(() => {
    const id = window.setInterval(() => {
      setCurrentTime(engine.getCurrentTime());
      setDuration(engine.getDuration());
    }, 250);
    return () => window.clearInterval(id);
  }, [engine]);

  useEffect(() => {
    if (!shareNote) return;
    const id = window.setTimeout(() => setShareNote(null), 2200);
    return () => window.clearTimeout(id);
  }, [shareNote]);

  async function onShareFrame() {
    if (sharing) return;
    setSharing(true);
    const result = await shareStoryFrame();
    setSharing(false);
    if (!result.ok) {
      if (result.reason !== "cancelled") {
        setShareNote("Kunne ikke gemme still");
      }
      return;
    }
    setShareNote(
      result.method === "share" ? "Klar til Stories" : "Still gemt",
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10" style={{ color: SILVER }}>
      {/* Right rail — vertically centered */}
      <div className="pointer-events-auto absolute top-1/2 right-3 flex -translate-y-1/2 flex-col items-center gap-5 md:right-6 md:gap-6">
        <button
          type="button"
          disabled
          className="flex h-11 w-11 items-center justify-center bg-transparent"
          style={{ color: SILVER_DIM }}
          aria-label="Next"
        >
          <IconNext />
        </button>

        <button
          type="button"
          disabled={!canControl}
          onClick={() => {
            if (isPlaying) pause();
            else void play();
          }}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-transparent transition active:opacity-70 disabled:opacity-35"
          style={{
            color: SILVER,
            border: `1px solid ${SILVER_SOFT}`,
          }}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {status === "loading" ? (
            <span className="text-xs tracking-widest" style={{ color: SILVER_SOFT }}>
              …
            </span>
          ) : isPlaying ? (
            <IconPause />
          ) : (
            <IconPlay />
          )}
        </button>

        <button
          type="button"
          disabled
          className="flex h-11 w-11 items-center justify-center bg-transparent"
          style={{ color: SILVER_DIM }}
          aria-label="Previous"
        >
          <IconPrev />
        </button>

        <button
          type="button"
          disabled={sharing}
          onClick={() => void onShareFrame()}
          className="flex h-11 w-11 items-center justify-center bg-transparent transition active:opacity-70 disabled:opacity-40"
          style={{ color: SILVER_SOFT }}
          aria-label="Del still til Stories"
          title="Del still til Stories"
        >
          <IconShare />
        </button>
      </div>

      {shareNote ? (
        <p
          className="pointer-events-none absolute top-[18%] left-1/2 z-20 -translate-x-1/2 text-center text-[11px] tracking-[0.18em] uppercase"
          style={{ color: SILVER_SOFT }}
          aria-live="polite"
        >
          {shareNote}
        </p>
      ) : null}

      {/* Bottom: title + seek */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 safe-area-pad px-4 pb-2 md:px-6 md:pb-3">
        <div className="mx-auto flex w-full max-w-md flex-col gap-3 md:max-w-lg">
          <div className="flex items-center justify-between gap-3">
            <ShowTitle title="TUSAY" />
            <button
              type="button"
              disabled
              className="flex h-10 w-10 shrink-0 items-center justify-center bg-transparent"
              style={{ color: SILVER_SOFT }}
              aria-label="Download — køb kommer snart"
              title="Download — kommer snart"
            >
              <IconDownload />
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.01}
            value={Math.min(currentTime, duration || 0)}
            disabled={!canControl || duration <= 0}
            onChange={(e) => seek(Number(e.target.value))}
            className="player-seek w-full"
            style={{ "--progress": `${progress}%` } as CSSProperties}
            aria-label="Seek"
          />
          <div
            className="flex justify-between text-[11px] tabular-nums tracking-wide"
            style={{ color: SILVER_DIM }}
          >
            <span>{formatTime(currentTime)}</span>
            <span>-{formatTime(remaining)}</span>
          </div>
        </div>

        {error ? (
          <p className="mt-2 text-center text-xs text-red-300/90">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
