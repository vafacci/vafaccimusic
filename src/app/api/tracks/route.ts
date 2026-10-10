import { NextResponse } from "next/server";
import type { CatalogRelease } from "@/data/catalog";
import {
  assertAudioFile,
  getUploadedTracks,
  saveAudioLocally,
  saveUploadedTracks,
  titleFromFilename,
  uploadAudioBlob,
} from "@/lib/trackCatalog";

export const runtime = "nodejs";

export async function GET() {
  const uploaded = await getUploadedTracks();
  return NextResponse.json({ tracks: uploaded });
}

/**
 * Register a track after client Blob upload (JSON),
 * or accept a small FormData upload in local/dev without Blob.
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        url?: string;
        filename?: string;
        duration?: string;
        id?: string;
        title?: string;
        shortTitle?: string;
      };

      if (!body.url || !body.filename) {
        return NextResponse.json(
          { error: "Missing url or filename" },
          { status: 400 },
        );
      }

      const named = titleFromFilename(body.filename);
      let id = body.id?.trim() || named.id;
      const title = body.title?.trim() || named.title;
      const shortTitle = body.shortTitle?.trim() || named.shortTitle;
      const duration =
        typeof body.duration === "string" && body.duration.trim()
          ? body.duration.trim()
          : undefined;

      const existing = await getUploadedTracks();
      if (existing.some((t) => t.id === id)) {
        id = `${id}-${Date.now().toString(36)}`;
      }

      const track: CatalogRelease = {
        id,
        title,
        shortTitle,
        artist: "VAFACCI",
        audio: body.url,
        duration,
      };

      const next = [track, ...existing.filter((t) => t.id !== track.id)];
      await saveUploadedTracks(next);
      return NextResponse.json({ track, tracks: next });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    assertAudioFile(file);

    const durationRaw = form.get("duration");
    const duration =
      typeof durationRaw === "string" && durationRaw.trim()
        ? durationRaw.trim()
        : undefined;

    const { id: baseId, title, shortTitle } = titleFromFilename(file.name);
    let id = baseId;

    const existing = await getUploadedTracks();
    if (existing.some((t) => t.id === id)) {
      id = `${baseId}-${Date.now().toString(36)}`;
    }

    const audio = process.env.BLOB_READ_WRITE_TOKEN
      ? await uploadAudioBlob(file, id)
      : await saveAudioLocally(file, id);

    const track: CatalogRelease = {
      id,
      title,
      shortTitle,
      artist: "VAFACCI",
      audio,
      duration,
    };

    const next = [track, ...existing.filter((t) => t.id !== track.id)];
    await saveUploadedTracks(next);

    return NextResponse.json({ track, tracks: next });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
