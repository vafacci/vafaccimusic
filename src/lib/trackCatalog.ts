import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogRelease } from "@/data/catalog";
import { slugifyTrackId } from "@/data/liveCatalog";

const BLOB_PATH = "tracks/uploaded.json";
const LOCAL_PATH = path.join(process.cwd(), ".data", "uploaded-tracks.json");
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024; // 40MB

function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function normalizeTrack(raw: unknown): CatalogRelease | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const id = typeof t.id === "string" ? t.id : "";
  const title = typeof t.title === "string" ? t.title : "";
  const shortTitle = typeof t.shortTitle === "string" ? t.shortTitle : title;
  const artist = typeof t.artist === "string" ? t.artist : "VAFACCI";
  const audio = typeof t.audio === "string" ? t.audio : "";
  if (!id || !title || !audio) return null;
  const duration =
    typeof t.duration === "string" && t.duration ? t.duration : undefined;
  return { id, title, shortTitle, artist, audio, duration };
}

function normalizeList(raw: unknown): CatalogRelease[] {
  if (!Array.isArray(raw)) return [];
  const out: CatalogRelease[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const track = normalizeTrack(item);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    out.push(track);
  }
  return out;
}

async function readLocal(): Promise<CatalogRelease[]> {
  try {
    const text = await readFile(LOCAL_PATH, "utf8");
    return normalizeList(JSON.parse(text));
  } catch {
    return [];
  }
}

async function writeLocal(tracks: CatalogRelease[]): Promise<void> {
  await mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  await writeFile(LOCAL_PATH, JSON.stringify(tracks, null, 2), "utf8");
}

async function readBlob(): Promise<CatalogRelease[]> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  try {
    const result = await get(BLOB_PATH, {
      access: "private",
      token,
      useCache: false,
    });
    if (!result || result.statusCode !== 200 || !result.stream) return [];
    const text = await new Response(result.stream).text();
    if (!text.trim()) return [];
    return normalizeList(JSON.parse(text));
  } catch {
    return [];
  }
}

async function writeBlob(tracks: CatalogRelease[]): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(tracks), {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
}

export async function getUploadedTracks(): Promise<CatalogRelease[]> {
  if (hasBlobToken()) return readBlob();
  return readLocal();
}

export async function saveUploadedTracks(
  tracks: CatalogRelease[],
): Promise<void> {
  if (hasBlobToken()) await writeBlob(tracks);
  else await writeLocal(tracks);
}

export function assertAudioFile(file: File): void {
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  const okType =
    type === "audio/mpeg" ||
    type === "audio/mp3" ||
    type === "audio/wav" ||
    type === "audio/x-wav" ||
    type === "audio/mp4" ||
    type === "audio/aac" ||
    type === "";
  const okExt = /\.(mp3|wav|m4a|aac)$/i.test(name);
  if (!okType && !okExt) {
    throw new Error("Only audio files (mp3/wav/m4a) are allowed");
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new Error("File must be under 40MB");
  }
}

export function titleFromFilename(filename: string): {
  id: string;
  title: string;
  shortTitle: string;
} {
  const bare = filename.replace(/\.[^.]+$/, "").trim() || "Untitled";
  const id = slugifyTrackId(bare);
  const shortTitle = bare.split(/[-–—]|ft\.?/i)[0]?.trim().toUpperCase() || bare;
  return {
    id,
    title: bare,
    shortTitle: shortTitle.slice(0, 18),
  };
}

export async function uploadAudioBlob(
  file: File,
  id: string,
): Promise<string> {
  const ext = (file.name.split(".").pop() || "mp3").toLowerCase();
  const pathname = `tracks/audio/${id}.${ext}`;
  const result = await put(pathname, file, {
    access: "public",
    token: process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: file.type || "audio/mpeg",
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return result.url;
}

/** Local-dev fallback when Blob token is missing — write under public/uploads. */
export async function saveAudioLocally(
  file: File,
  id: string,
): Promise<string> {
  const ext = (file.name.split(".").pop() || "mp3").toLowerCase();
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const filename = `${id}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buf);
  return `/uploads/${filename}`;
}
