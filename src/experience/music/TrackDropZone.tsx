"use client";

import { upload } from "@vercel/blob/client";
import { useRef, useState, type DragEvent } from "react";
import type { CatalogRelease } from "@/data/catalog";
import { formatDurationLabel, slugifyTrackId } from "@/data/liveCatalog";

type TrackDropZoneProps = {
  onUploaded: (track: CatalogRelease, tracks: CatalogRelease[]) => void;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(id);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(id);
        reject(err);
      },
    );
  });
}

async function readAudioDuration(file: File): Promise<string | undefined> {
  return withTimeout(
    new Promise<string | undefined>((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.preload = "metadata";
      const done = (label?: string) => {
        URL.revokeObjectURL(url);
        resolve(label);
      };
      audio.onloadedmetadata = () => {
        done(formatDurationLabel(audio.duration));
      };
      audio.onerror = () => done(undefined);
      audio.src = url;
    }),
    2500,
    "Reading duration",
  ).catch(() => undefined);
}

function guessContentType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "wav") return "audio/wav";
  if (ext === "m4a") return "audio/mp4";
  if (ext === "aac") return "audio/aac";
  return "audio/mpeg";
}

/**
 * Drop / pick an audio file on Tracks — uploads and prepends to the playlist.
 */
export function TrackDropZone({ onUploaded }: TrackDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  async function registerTrack(payload: {
    url: string;
    filename: string;
    duration?: string;
    id: string;
  }) {
    const res = await fetch("/api/tracks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as {
      error?: string;
      track?: CatalogRelease;
      tracks?: CatalogRelease[];
    };
    if (!res.ok || !data.track || !data.tracks) {
      throw new Error(data.error || "Could not add track");
    }
    return data;
  }

  async function uploadFile(file: File) {
    if (busy) return;
    setBusy(true);
    setPercent(0);
    setNote(`Uploading ${file.name}…`);

    const controller = new AbortController();
    const hardTimeout = window.setTimeout(() => {
      controller.abort();
    }, 90_000);

    try {
      const duration = await readAudioDuration(file);
      const bare = file.name.replace(/\.[^.]+$/, "");
      const id = slugifyTrackId(bare) || `track-${Date.now()}`;
      const ext = (file.name.split(".").pop() || "mp3").toLowerCase();
      const contentType = guessContentType(file);

      // Direct-to-Blob from the browser (bypasses serverless body size limits).
      const blob = await upload(`tracks/audio/${id}.${ext}`, file, {
        access: "public",
        handleUploadUrl: "/api/tracks/upload",
        contentType,
        // Keep simple PUT — multipart has been flaky on mobile Safari
        multipart: false,
        abortSignal: controller.signal,
        onUploadProgress: ({ percentage }) => {
          setPercent(Math.round(percentage));
          setNote(`Uploading ${file.name}… ${Math.round(percentage)}%`);
        },
      });

      setPercent(100);
      setNote("Saving to playlist…");

      const data = await withTimeout(
        registerTrack({
          url: blob.url,
          filename: file.name,
          duration,
          id,
        }),
        20_000,
        "Saving track",
      );

      onUploaded(data.track!, data.tracks!);
      setNote(`Added ${data.track!.shortTitle}`);
      window.setTimeout(() => setNote(null), 2200);
    } catch (err) {
      const aborted =
        err instanceof DOMException && err.name === "AbortError";
      const message = aborted
        ? "Upload timed out — try again on Wi‑Fi"
        : err instanceof Error
          ? err.message
          : "Upload failed";
      setNote(message);
      window.setTimeout(() => setNote(null), 4500);
    } finally {
      window.clearTimeout(hardTimeout);
      setBusy(false);
      setPercent(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  return (
    <div className="track-drop">
      <button
        type="button"
        className={`track-drop__zone${dragging ? " is-dragging" : ""}${busy ? " is-busy" : ""}`}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Drop an audio file to add a track"
      >
        <span className="track-drop__label">
          {busy ? "Uploading…" : "Drop track here"}
        </span>
        <span className="track-drop__hint">
          {busy && percent > 0
            ? `${percent}%`
            : "mp3 / wav · or tap to choose"}
        </span>
        {busy ? (
          <span
            className="track-drop__bar"
            aria-hidden
          >
            <span
              className="track-drop__bar-fill"
              style={{ width: `${Math.max(percent, 4)}%` }}
            />
          </span>
        ) : null}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,.mp3,.wav,.m4a,.aac"
        className="track-drop__input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFile(file);
        }}
      />
      {note ? (
        <p className="track-drop__note" aria-live="polite">
          {note}
        </p>
      ) : null}
    </div>
  );
}
