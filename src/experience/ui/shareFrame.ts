import { getLiveCanvas } from "@/experience/canvas/liveCanvasBridge";

const STORY_W = 1080;
const STORY_H = 1920;

export type ShareFrameResult =
  | { ok: true; method: "share" | "download" }
  | { ok: false; reason: "no-canvas" | "failed" | "cancelled" };

function pageUrl(): string {
  if (typeof window === "undefined") return "https://vafacci.com";
  return `${window.location.origin}${window.location.pathname}`;
}

function coverCropDraw(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  dw: number,
  dh: number,
) {
  const sw = source.width;
  const sh = source.height;
  const target = dw / dh;
  const srcAspect = sw / sh;

  let sx = 0;
  let sy = 0;
  let sWidth = sw;
  let sHeight = sh;

  if (srcAspect > target) {
    sWidth = sh * target;
    sx = (sw - sWidth) / 2;
  } else {
    sHeight = sw / target;
    sy = (sh - sHeight) / 2;
  }

  ctx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, dw, dh);
}

function paintCredits(ctx: CanvasRenderingContext2D, url: string) {
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(230, 233, 238, 0.9)";
  ctx.font = '400 34px "Times New Roman", Times, serif';

  ctx.textAlign = "left";
  ctx.fillText("VAFACCI", 72, 110);
  ctx.fillText("TUSAY", 72, STORY_H - 150);

  // Link on the frame — survives Instagram image-only share
  const display = url.replace(/^https?:\/\//, "");
  ctx.fillStyle = "rgba(197, 202, 211, 0.55)";
  ctx.font = '400 22px "Times New Roman", Times, serif';
  ctx.fillText(display, 72, STORY_H - 95);
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function tryShare(data: ShareData): Promise<"shared" | "cancelled" | "failed"> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "failed";
  }
  try {
    if (typeof navigator.canShare === "function" && !navigator.canShare(data)) {
      return "failed";
    }
    await navigator.share(data);
    return "shared";
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return "cancelled";
    }
    return "failed";
  }
}

/**
 * Freeze the LED wall into a 9:16 Stories still + page link, then share.
 */
export async function shareStoryFrame(): Promise<ShareFrameResult> {
  const live = getLiveCanvas();
  if (!live) return { ok: false, reason: "no-canvas" };

  const url = pageUrl();

  try {
    const out = document.createElement("canvas");
    out.width = STORY_W;
    out.height = STORY_H;
    const ctx = out.getContext("2d");
    if (!ctx) return { ok: false, reason: "failed" };

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, STORY_W, STORY_H);
    coverCropDraw(ctx, live, STORY_W, STORY_H);
    paintCredits(ctx, url);

    const blob = await canvasToBlob(out);
    if (!blob) return { ok: false, reason: "failed" };

    const file = new File([blob], "vafacci-tusay-story.png", {
      type: "image/png",
    });

    const withFiles: ShareData = {
      files: [file],
      title: "VAFACCI — TUSAY",
      text: `VAFACCI — TUSAY\n${url}`,
      url,
    };

    const fileShare = await tryShare(withFiles);
    if (fileShare === "shared") return { ok: true, method: "share" };
    if (fileShare === "cancelled") return { ok: false, reason: "cancelled" };

    // Some targets accept link share even when files are blocked
    const linkOnly = await tryShare({
      title: "VAFACCI — TUSAY",
      text: `VAFACCI — TUSAY\n${url}`,
      url,
    });
    if (linkOnly === "shared") return { ok: true, method: "share" };
    if (linkOnly === "cancelled") return { ok: false, reason: "cancelled" };

    downloadBlob(blob, file.name);
    return { ok: true, method: "download" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
