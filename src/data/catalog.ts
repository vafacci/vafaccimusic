/**
 * Discography catalog for the /music playlist.
 *
 * ORDER RULE: newest releases first. Always prepend new tracks at the top
 * of CATALOG so they show first in /music and next/prev navigation.
 * Copy source files from /assets into /public/audio with URL-safe names,
 * then add the entry here.
 */
export type CatalogRelease = {
  id: string;
  title: string;
  shortTitle: string;
  artist: string;
  /** Display duration, e.g. "1:49" */
  duration?: string;
  audio?: string;
  worldHref?: string;
};

export const CATALOG: CatalogRelease[] = [
  {
    id: "kfc-ft-farli-facci-omar",
    title: "KFC ft. farli x facci x omar",
    shortTitle: "KFC",
    artist: "VAFACCI",
    duration: "2:17",
    audio: "/audio/kfc-ft-farli-facci-omar.mp3",
  },
  {
    id: "hold-ud-ft-facci-farli",
    title: "HOLD UD ft. facci x farli",
    shortTitle: "HOLD UD",
    artist: "VAFACCI",
    duration: "1:35",
    audio: "/audio/hold-ud-ft-facci-farli.mp3",
  },
  {
    id: "amos-ft-farli-omsehh-hamsi",
    title: "AMOS ft. farli x omsehh x hamsi",
    shortTitle: "AMOS",
    artist: "VAFACCI",
    duration: "1:16",
    audio: "/audio/amos-ft-farli-omsehh-hamsi.mp3",
  },
  {
    id: "tusay-ft-facci",
    title: "TUSAY ft. facci",
    shortTitle: "TUSAY",
    artist: "VAFACCI",
    duration: "0:59",
    audio: "/audio/tusay-ft-facci.mp3",
    worldHref: "/",
  },
  {
    id: "viola-ft-facci",
    title: "VIOLA ft. facci",
    shortTitle: "VIOLA",
    artist: "VAFACCI",
    duration: "1:49",
    audio: "/audio/viola-ft-facci.mp3",
  },
  {
    id: "abc-ft-farli",
    title: "ABC ft. farli",
    shortTitle: "ABC",
    artist: "VAFACCI",
    duration: "3:33",
    audio: "/audio/abc-ft-farli.mp3",
  },
  {
    id: "backseat-ft-omsehh",
    title: "BACKSEAT ft. omsehh",
    shortTitle: "BACKSEAT",
    artist: "VAFACCI",
    duration: "1:59",
    audio: "/audio/backseat-ft-omsehh.mp3",
  },
  {
    id: "fkd-up-ft-dior-3xb-farli",
    title: "FKD UP ft. dior x 3xb x farli",
    shortTitle: "FKD UP",
    artist: "VAFACCI",
    duration: "1:14",
    audio: "/audio/fkd-up-ft-dior-3xb-farli.mp3",
  },
  {
    id: "for-meget-madrassen-ft-lay",
    title: "FOR MEGET + MADRASSEN ft. lay",
    shortTitle: "FOR MEGET",
    artist: "VAFACCI",
    duration: "2:43",
    audio: "/audio/for-meget-madrassen-ft-lay.mp3",
  },
  {
    id: "foreign-ft-kabz-lay",
    title: "FOREIGN ft. kabz x lay",
    shortTitle: "FOREIGN",
    artist: "VAFACCI",
    duration: "2:32",
    audio: "/audio/foreign-ft-kabz-lay.mp3",
  },
  {
    id: "nosebleed-prod-morti",
    title: "NOSEBLEED prod. morti",
    shortTitle: "NOSEBLEED",
    artist: "VAFACCI",
    duration: "1:46",
    audio: "/audio/nosebleed-prod-morti.mp3",
  },
  {
    id: "okay-shi-ft-3xb-woody",
    title: "OKAY SHI ft. 3xb x woody",
    shortTitle: "OKAY SHI",
    artist: "VAFACCI",
    duration: "1:57",
    audio: "/audio/okay-shi-ft-3xb-woody.mp3",
  },
  {
    id: "rejseplan-ft-k4bz",
    title: "REJSEPLAN ft. k4bz",
    shortTitle: "REJSEPLAN",
    artist: "VAFACCI",
    duration: "2:09",
    audio: "/audio/rejseplan-ft-k4bz.mp3",
  },
  {
    id: "soho-ft-k4bz",
    title: "SOHO ft. K4BZ",
    shortTitle: "SOHO",
    artist: "VAFACCI",
    duration: "1:47",
    audio: "/audio/soho-ft-k4bz.mp3",
  },
];

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Resolve catalog entry from the currently loaded audio URL. */
export function getCatalogByAudio(
  url: string | null | undefined,
): CatalogRelease {
  if (url) {
    const hit = CATALOG.find((t) => t.audio === url);
    if (hit) return hit;
  }
  return CATALOG[0]!;
}

export function getCatalogIndexByAudio(
  url: string | null | undefined,
): number {
  if (!url) return 0;
  const i = CATALOG.findIndex((t) => t.audio === url);
  return i >= 0 ? i : 0;
}
