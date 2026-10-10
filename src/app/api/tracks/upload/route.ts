import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Issues a short-lived client token so the browser can upload audio
 * straight to Vercel Blob (avoids the ~4.5MB serverless body limit).
 */
export async function POST(request: Request) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Blob storage is not configured" },
      { status: 503 },
    );
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const json = await handleUpload({
      body,
      request,
      token,
      onBeforeGenerateToken: async () => ({
        // iOS / Android often send empty type or octet-stream
        allowedContentTypes: [
          "audio/mpeg",
          "audio/mp3",
          "audio/wav",
          "audio/x-wav",
          "audio/wave",
          "audio/mp4",
          "audio/aac",
          "audio/x-m4a",
          "audio/m4a",
          "application/octet-stream",
        ],
        maximumSizeInBytes: 40 * 1024 * 1024,
        addRandomSuffix: false,
        allowOverwrite: true,
      }),
    });
    return NextResponse.json(json);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload token failed";
    console.error("[tracks/upload]", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
