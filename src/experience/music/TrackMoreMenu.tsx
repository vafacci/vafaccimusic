"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { CatalogRelease } from "@/data/catalog";
import { shareTrackLink } from "@/experience/ui/shareTrackLink";

type TrackMoreMenuProps = {
  track: CatalogRelease;
};

type PanelPos = { top: number; left: number; origin: "top" | "bottom" };

function IconMore() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="5" cy="12" r="1.55" fill="currentColor" />
      <circle cx="12" cy="12" r="1.55" fill="currentColor" />
      <circle cx="19" cy="12" r="1.55" fill="currentColor" />
    </svg>
  );
}

function IconShare() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="18" cy="5" r="2.1" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="6" cy="12" r="2.1" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="18" cy="19" r="2.1" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M8.2 13.1l7.5 4.3M15.7 6.6l-7.5 4.3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v11M8 12l4 4 4-4M5 19h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function placePanel(trigger: HTMLElement): PanelPos {
  const rect = trigger.getBoundingClientRect();
  const width = 188;
  const height = 112;
  const gap = 8;
  const pad = 12;

  let left = rect.right - width;
  left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));

  const below = rect.bottom + gap;
  const above = rect.top - gap - height;
  const fitsBelow = below + height <= window.innerHeight - pad;

  if (fitsBelow || above < pad) {
    return { top: below, left, origin: "top" };
  }
  return { top: Math.max(pad, above), left, origin: "bottom" };
}

/**
 * Compact ⋯ menu — share + download, same actions as the landing chrome.
 */
export function TrackMoreMenu({ track }: TrackMoreMenuProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    const update = () => {
      if (!triggerRef.current) return;
      setPos(placePanel(triggerRef.current));
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 1800);
    return () => window.clearTimeout(id);
  }, [note]);

  async function onShare() {
    if (busy) return;
    setBusy(true);
    const result = await shareTrackLink(track);
    setBusy(false);
    setOpen(false);
    if (!result.ok) {
      if (result.reason !== "cancelled") setNote("Kunne ikke dele");
      return;
    }
    setNote(result.method === "share" ? "Link delt" : "Link kopieret");
  }

  const panel =
    mounted && open && pos
      ? createPortal(
          <div
            className="music-more-layer"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          >
            <div
              ref={panelRef}
              id={menuId}
              role="menu"
              className={`music-more-panel music-more-panel--from-${pos.origin}`}
              style={{ top: pos.top, left: pos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="music-more-panel__item"
                role="menuitem"
                disabled={busy}
                onClick={() => void onShare()}
              >
                <span className="music-more-panel__icon">
                  <IconShare />
                </span>
                <span className="music-more-panel__label">Share</span>
              </button>
              <button
                type="button"
                className="music-more-panel__item is-soon"
                role="menuitem"
                disabled
                title="Download — kommer snart"
              >
                <span className="music-more-panel__icon">
                  <IconDownload />
                </span>
                <span className="music-more-panel__label">Download</span>
                <span className="music-more-panel__soon">Snart</span>
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="music-more" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`music-more__trigger${open ? " is-open" : ""}`}
        aria-label={`Flere muligheder for ${track.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <IconMore />
      </button>

      {panel}

      {note ? (
        <span className="music-more__note" aria-live="polite">
          {note}
        </span>
      ) : null}
    </div>
  );
}
