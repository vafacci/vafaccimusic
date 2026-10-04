"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  CATALOG,
  getCatalogByAudio,
  getCatalogIndexByAudio,
} from "@/data/catalog";
import { useAudioStore } from "@/experience/audio/audioStore";
import { shareTrackLink } from "./shareTrackLink";
import { ShowTitle } from "./ShowTitle";

/* Near-white chrome — readable outdoors against glare */
const SILVER = "#f5f6f8";
const SILVER_DIM = "rgba(245, 246, 248, 0.78)";
const SILVER_SOFT = "rgba(245, 246, 248, 0.94)";
const CTRL_BG = "rgba(0, 0, 0, 0.72)";
const CTRL_BORDER = "rgba(245, 246, 248, 0.88)";

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
        strokeWidth="2"
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
        strokeWidth="2"
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
        strokeWidth="2"
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
        strokeWidth="2"
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
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShare() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="18" cy="5" r="2.25" stroke="currentColor" strokeWidth="2" />
      <circle cx="6" cy="12" r="2.25" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="19" r="2.25" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8.2 13.1l7.5 4.3M15.7 6.6l-7.5 4.3"
        stroke="currentColor"
        strokeWidth="2"
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
  const trackUrl = useAudioStore((s) => s.trackUrl);
  const load = useAudioStore((s) => s.load);
  const play = useAudioStore((s) => s.play);
  const pause = useAudioStore((s) => s.pause);
  const seek = useAudioStore((s) => s.seek);
  const engine = useAudioStore((s) => s.engine);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const track = getCatalogByAudio(trackUrl);
  const trackIndex = getCatalogIndexByAudio(trackUrl);
  const isPlaying = status === "playing";
  const canControl = status === "ready" || status === "playing";
  const remaining = Math.max(duration - currentTime, 0);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const canPrev = trackIndex > 0;
  const canNext = trackIndex < CATALOG.length - 1;

  async function onStep(delta: -1 | 1) {
    const next = Math.min(CATALOG.length - 1, Math.max(0, trackIndex + delta));
    if (next === trackIndex) return;
    const item = CATALOG[next];
    if (!item?.audio) return;
    await load(item.audio);
    await play();
  }

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

  async function onShareLink() {
    if (sharing) return;
    setSharing(true);
    const result = await shareTrackLink(track);
    setSharing(false);
    if (!result.ok) {
      if (result.reason !== "cancelled") {
        setShareNote("Kunne ikke dele link");
      }
      return;
    }
    setShareNote(
      result.method === "share" ? "Link delt" : "Link kopieret",
    );
  }

  const ctrlStyle = (enabled: boolean): CSSProperties => ({
    color: enabled ? SILVER : SILVER_DIM,
    background: CTRL_BG,
    border: `1.5px solid ${enabled ? CTRL_BORDER : "rgba(245, 246, 248, 0.35)"}`,
    boxShadow: "0 1px 0 rgba(0,0,0,0.55)",
  });

  const ghostStyle: CSSProperties = {
    color: SILVER_SOFT,
    background: "transparent",
    border: 0,
    outline: "none",
    boxShadow: "none",
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10" style={{ color: SILVER }}>
      {/* Right rail — vertically centered */}
      <div className="pointer-events-auto absolute top-1/2 right-3 flex -translate-y-1/2 flex-col items-center gap-5 md:right-6 md:gap-6">
        <button
          type="button"
          disabled={!canNext || status === "loading"}
          onClick={() => void onStep(1)}
          className="flex h-11 w-11 items-center justify-center bg-transparent outline-none transition active:opacity-70 disabled:opacity-40"
          style={{
            ...ghostStyle,
            color: canNext ? SILVER_SOFT : SILVER_DIM,
          }}
          aria-label="Next track"
        >
          <IconNext />
        </button>

        <button
          type="button"
          disabled={!canControl && status !== "loading"}
          onClick={() => {
            if (isPlaying) pause();
            else void play();
          }}
          className="flex h-14 w-14 items-center justify-center rounded-full transition active:opacity-80 disabled:opacity-55"
          style={ctrlStyle(true)}
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
          disabled={!canPrev || status === "loading"}
          onClick={() => void onStep(-1)}
          className="flex h-11 w-11 items-center justify-center bg-transparent outline-none transition active:opacity-70 disabled:opacity-40"
          style={{
            ...ghostStyle,
            color: canPrev ? SILVER_SOFT : SILVER_DIM,
          }}
          aria-label="Previous track"
        >
          <IconPrev />
        </button>
      </div>

      {shareNote ? (
        <p
          className="pointer-events-none absolute top-[18%] left-1/2 z-20 -translate-x-1/2 px-3 py-1.5 text-center text-[11px] tracking-[0.18em] uppercase"
          style={{
            color: SILVER,
            background: CTRL_BG,
            border: 0,
            outline: "none",
          }}
          aria-live="polite"
        >
          {shareNote}
        </p>
      ) : null}

      {/* Bottom: title + seek — dark scrim keeps type readable in sun */}
      <div
        className="pointer-events-auto absolute inset-x-0 bottom-0 safe-area-pad px-4 pb-2 md:px-6 md:pb-3"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.72) 55%, transparent 100%)",
        }}
      >
        <div className="mx-auto flex w-full max-w-md flex-col gap-3 md:max-w-lg">
          <div className="flex items-center justify-between gap-3">
            <ShowTitle title={track.title} />
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={sharing}
                onClick={() => void onShareLink()}
                className="flex h-10 w-10 items-center justify-center bg-transparent outline-none transition active:opacity-70 disabled:opacity-55"
                style={ghostStyle}
                aria-label="Del link til denne sang"
                title="Del link til denne sang"
              >
                <IconShare />
              </button>
              <button
                type="button"
                disabled
                className="flex h-10 w-10 items-center justify-center bg-transparent outline-none"
                style={ghostStyle}
                aria-label="Download — køb kommer snart"
                title="Download — kommer snart"
              >
                <IconDownload />
              </button>
            </div>
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
            className="flex justify-between text-[12px] font-medium tabular-nums tracking-wide"
            style={{ color: SILVER_DIM }}
          >
            <span>{formatTime(currentTime)}</span>
            <span>-{formatTime(remaining)}</span>
          </div>
        </div>

        {error ? (
          <p className="mt-2 text-center text-xs text-red-200">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
