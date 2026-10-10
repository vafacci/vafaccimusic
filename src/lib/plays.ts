import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CATALOG } from "@/data/catalog";
import type { PlayCounts } from "@/lib/playStats";
import { getUploadedTracks } from "@/lib/trackCatalog";

export type { PlayCounts } from "@/lib/playStats";
export { formatPlays } from "@/lib/playStats";

const BLOB_PATH = "plays/counts.json";
const LOCAL_PATH = path.join(process.cwd(), ".data", "plays.json");

function emptyCounts(extraIds: string[] = []): PlayCounts {
  const counts: PlayCounts = {};
  for (const track of CATALOG) {
    counts[track.id] = 0;
  }
  for (const id of extraIds) {
    counts[id] = counts[id] ?? 0;
  }
  return counts;
}

function normalize(raw: unknown, extraIds: string[] = []): PlayCounts {
  const base = emptyCounts(extraIds);
  if (!raw || typeof raw !== "object") return base;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      base[key] = Math.floor(value);
    }
  }
  return base;
}

async function knownTrackIds(): Promise<Set<string>> {
  const uploaded = await getUploadedTracks();
  return new Set([
    ...CATALOG.map((t) => t.id),
    ...uploaded.map((t) => t.id),
  ]);
}

function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readLocal(extraIds: string[] = []): Promise<PlayCounts> {
  try {
    const text = await readFile(LOCAL_PATH, "utf8");
    return normalize(JSON.parse(text), extraIds);
  } catch {
    return emptyCounts(extraIds);
  }
}

async function writeLocal(counts: PlayCounts): Promise<void> {
  await mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  await writeFile(LOCAL_PATH, JSON.stringify(counts), "utf8");
}

/**
 * Private blobs cannot be fetched via the public URL (403).
 * Must use authenticated `get()` — otherwise every increment resets all counts.
 */
async function readBlob(extraIds: string[] = []): Promise<PlayCounts> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  try {
    const result = await get(BLOB_PATH, {
      access: "private",
      token,
      useCache: false,
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return emptyCounts(extraIds);
    }
    const text = await new Response(result.stream).text();
    if (!text.trim()) return emptyCounts(extraIds);
    return normalize(JSON.parse(text), extraIds);
  } catch {
    return emptyCounts(extraIds);
  }
}

async function writeBlob(counts: PlayCounts): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(counts), {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
}

/** Durable play totals — Vercel Blob in prod, local `.data` in dev without token. */
export async function getPlayCounts(): Promise<PlayCounts> {
  const ids = [...(await knownTrackIds())];
  if (hasBlobToken()) return readBlob(ids);
  return readLocal(ids);
}

export async function incrementPlay(trackId: string): Promise<PlayCounts> {
  const known = await knownTrackIds();
  if (!known.has(trackId)) {
    throw new Error("Unknown track");
  }

  const counts = await getPlayCounts();
  counts[trackId] = (counts[trackId] ?? 0) + 1;

  if (hasBlobToken()) {
    await writeBlob(counts);
  } else {
    await writeLocal(counts);
  }

  return counts;
}
