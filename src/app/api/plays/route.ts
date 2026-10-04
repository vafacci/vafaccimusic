import { NextResponse } from "next/server";
import { CATALOG } from "@/data/catalog";
import { getPlayCounts, incrementPlay } from "@/lib/plays";

export const runtime = "nodejs";

export async function GET() {
  const counts = await getPlayCounts();
  return NextResponse.json({ counts });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trackId =
    body && typeof body === "object" && "trackId" in body
      ? String((body as { trackId: unknown }).trackId)
      : "";

  if (!CATALOG.some((t) => t.id === trackId)) {
    return NextResponse.json({ error: "Unknown track" }, { status: 400 });
  }

  try {
    const counts = await incrementPlay(trackId);
    return NextResponse.json({ counts, trackId, plays: counts[trackId] ?? 0 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to record play";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
