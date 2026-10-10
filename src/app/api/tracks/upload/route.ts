import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Issues a short-lived client token so the browser can upload audio
 * straight to Vercel Blob (avoids the ~4.5MB serverless body limit).
 */
export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Blob storage is not configured" },
      { status: 503 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "audio/mpeg",
          "audio/mp3",
          "audio/wav",
          "audio/x-wav",
          "audio/mp4",
          "audio/aac",
          "audio/x-m4a",
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
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
