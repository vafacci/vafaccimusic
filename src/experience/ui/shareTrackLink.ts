import type { CatalogRelease } from "@/data/catalog";

export type ShareLinkResult =
  | { ok: true; method: "share" | "clipboard" }
  | { ok: false; reason: "failed" | "cancelled" };

/** Canonical share URL for a catalog track. */
export function trackShareUrl(track: CatalogRelease): string {
  if (typeof window === "undefined") {
    return `https://vafacci.com/music?track=${encodeURIComponent(track.id)}`;
  }
  return `${window.location.origin}/music?track=${encodeURIComponent(track.id)}`;
}

/**
 * Share only a link to the exact track — no image/file.
 */
export async function shareTrackLink(
  track: CatalogRelease,
): Promise<ShareLinkResult> {
  const url = trackShareUrl(track);
  const title = `VAFACCI — ${track.title}`;
  const text = title;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const data: ShareData = { title, text, url };
      if (
        typeof navigator.canShare === "function" &&
        !navigator.canShare(data)
      ) {
        // fall through to clipboard
      } else {
        await navigator.share(data);
        return { ok: true, method: "share" };
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { ok: false, reason: "cancelled" };
      }
      // fall through to clipboard
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return { ok: true, method: "clipboard" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
