"use client";

import { upload } from "@vercel/blob/client";
import { useRef, useState, type DragEvent } from "react";
import type { CatalogRelease } from "@/data/catalog";
import { formatDurationLabel, slugifyTrackId } from "@/data/liveCatalog";

type TrackDropZoneProps = {
  onUploaded: (track: CatalogRelease, tracks: CatalogRelease[]) => void;
};

async function readAudioDuration(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
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
  });
}

/**
 * Drop / pick an audio file on Tracks — uploads and prepends to the playlist.
 */
export function TrackDropZone({ onUploaded }: TrackDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
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
    setNote(`Uploading ${file.name}…`);
    try {
      const duration = await readAudioDuration(file);
      const bare = file.name.replace(/\.[^.]+$/, "");
      const id = slugifyTrackId(bare) || `track-${Date.now()}`;
      const ext = (file.name.split(".").pop() || "mp3").toLowerCase();

      // Prefer direct-to-Blob client upload (large files / production).
      try {
        const blob = await upload(`tracks/audio/${id}.${ext}`, file, {
          access: "public",
          handleUploadUrl: "/api/tracks/upload",
          multipart: file.size > 8 * 1024 * 1024,
        });
        const data = await registerTrack({
          url: blob.url,
          filename: file.name,
          duration,
          id,
        });
        onUploaded(data.track!, data.tracks!);
        setNote(`Added ${data.track!.shortTitle}`);
        window.setTimeout(() => setNote(null), 2200);
        return;
      } catch {
        // Fall through to FormData (local / small files without Blob token route)
      }

      const body = new FormData();
      body.append("file", file);
      if (duration) body.append("duration", duration);
      const res = await fetch("/api/tracks", { method: "POST", body });
      const data = (await res.json()) as {
        error?: string;
        track?: CatalogRelease;
        tracks?: CatalogRelease[];
      };
      if (!res.ok || !data.track || !data.tracks) {
        throw new Error(data.error || "Upload failed");
      }
      onUploaded(data.track, data.tracks);
      setNote(`Added ${data.track.shortTitle}`);
      window.setTimeout(() => setNote(null), 2200);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Upload failed");
      window.setTimeout(() => setNote(null), 3200);
    } finally {
      setBusy(false);
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
        <span className="track-drop__hint">mp3 / wav · or tap to choose</span>
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
