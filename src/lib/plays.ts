import { head, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CATALOG } from "@/data/catalog";
import type { PlayCounts } from "@/lib/playStats";

export type { PlayCounts } from "@/lib/playStats";
export { formatPlays } from "@/lib/playStats";

const BLOB_PATH = "plays/counts.json";
const LOCAL_PATH = path.join(process.cwd(), ".data", "plays.json");

function emptyCounts(): PlayCounts {
  const counts: PlayCounts = {};
  for (const track of CATALOG) {
    counts[track.id] = 0;
  }
  return counts;
}

function normalize(raw: unknown): PlayCounts {
  const base = emptyCounts();
  if (!raw || typeof raw !== "object") return base;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      base[key] = Math.floor(value);
    }
  }
  return base;
}

function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readLocal(): Promise<PlayCounts> {
  try {
    const text = await readFile(LOCAL_PATH, "utf8");
    return normalize(JSON.parse(text));
  } catch {
    return emptyCounts();
  }
}

async function writeLocal(counts: PlayCounts): Promise<void> {
  await mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  await writeFile(LOCAL_PATH, JSON.stringify(counts), "utf8");
}

async function readBlob(): Promise<PlayCounts> {
  try {
    const meta = await head(BLOB_PATH, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(meta.url, { cache: "no-store" });
    if (!res.ok) return emptyCounts();
    return normalize(await res.json());
  } catch {
    return emptyCounts();
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

export async function getPlayCounts(): Promise<PlayCounts> {
  if (hasBlobToken()) return readBlob();
  return readLocal();
}

export async function incrementPlay(trackId: string): Promise<PlayCounts> {
  if (!CATALOG.some((t) => t.id === trackId)) {
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
