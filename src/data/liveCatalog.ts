import { CATALOG, type CatalogRelease } from "@/data/catalog";

/**
 * Runtime catalog = browser/API uploads (newest first) + seeded CATALOG.
 * Audio store / media session read this so auto-next includes dropped tracks.
 */
let uploaded: CatalogRelease[] = [];

export function getUploadedTracks(): CatalogRelease[] {
  return uploaded;
}

export function setUploadedTracks(tracks: CatalogRelease[]): void {
  uploaded = Array.isArray(tracks) ? tracks : [];
}

export function prependUploadedTrack(track: CatalogRelease): void {
  uploaded = [track, ...uploaded.filter((t) => t.id !== track.id)];
}

export function getLiveCatalog(): CatalogRelease[] {
  const seen = new Set<string>();
  const out: CatalogRelease[] = [];
  for (const track of [...uploaded, ...CATALOG]) {
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    out.push(track);
  }
  return out;
}

export function getCatalogByAudio(
  url: string | null | undefined,
): CatalogRelease {
  const list = getLiveCatalog();
  if (url) {
    const hit = list.find((t) => t.audio === url);
    if (hit) return hit;
  }
  return list[0]!;
}

export function getCatalogIndexByAudio(
  url: string | null | undefined,
): number {
  if (!url) return 0;
  const i = getLiveCatalog().findIndex((t) => t.audio === url);
  return i >= 0 ? i : 0;
}

export function slugifyTrackId(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return base || `track-${Date.now()}`;
}

export function formatDurationLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
