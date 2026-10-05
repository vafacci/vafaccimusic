import Link from "next/link";

/**
 * Top chrome — VAFACCI logo left, Tracks / Releases right.
 */
export function BrandMark() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 safe-area-pad px-4 pt-3 md:px-6 md:pt-4">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="brand-mark pointer-events-auto">
          VAFACCI
        </Link>
        <nav className="pointer-events-auto flex items-center gap-5 md:gap-7">
          <Link href="/music" className="top-link">
            Tracks
          </Link>
          <Link href="/releases" className="top-link">
            Releases
          </Link>
        </nav>
      </div>
    </div>
  );
}
