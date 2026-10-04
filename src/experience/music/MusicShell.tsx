"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CATALOG, formatTime } from "@/data/catalog";
import { useAudioStore } from "@/experience/audio/audioStore";
import { formatPlays, type PlayCounts } from "@/lib/playStats";
import { useMusicGalleryStore } from "./musicStore";

const Experience = dynamic(
  () =>
    import("@/experience/canvas/Experience").then((m) => m.Experience),
  { ssr: false },
);

function matchesQuery(
  item: (typeof CATALOG)[number],
  normalized: string,
): boolean {
  if (!normalized) return true;
  const hay = `${item.title} ${item.shortTitle} ${item.artist}`.toLowerCase();
  return hay.includes(normalized);
}

/**
 * /music — modern aligned playlist + live search.
 */
export function MusicShell() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndexRef = useRef(0);
  const rafRef = useRef(0);
  const visibleRef = useRef<{ item: (typeof CATALOG)[number]; index: number }[]>(
    [],
  );

  const activeIndex = useMusicGalleryStore((s) => s.activeIndex);
  const setScrollProgress = useMusicGalleryStore((s) => s.setScrollProgress);
  const setFloatIndex = useMusicGalleryStore((s) => s.setFloatIndex);
  const setActiveIndex = useMusicGalleryStore((s) => s.setActiveIndex);

  const engine = useAudioStore((s) => s.engine);
  const status = useAudioStore((s) => s.status);
  const trackUrl = useAudioStore((s) => s.trackUrl);
  const load = useAudioStore((s) => s.load);
  const play = useAudioStore((s) => s.play);
  const pause = useAudioStore((s) => s.pause);
  const seek = useAudioStore((s) => s.seek);

  const [booted, setBooted] = useState(false);
  const [now, setNow] = useState(0);
  const [duration, setDuration] = useState(0);
  const [padEndPx, setPadEndPx] = useState(0);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [plays, setPlays] = useState<PlayCounts>({});

  const release = CATALOG[activeIndex] ?? CATALOG[0]!;
  const playingItem = trackUrl
    ? (CATALOG.find((t) => t.audio && t.audio === trackUrl) ?? null)
    : null;
  const isPlaying = status === "playing";
  const miniTitle = playingItem?.title ?? release.title;
  const progress =
    duration > 0 ? Math.min(100, Math.max(0, (now / duration) * 100)) : 0;

  const normalized = query.trim().toLowerCase();
  const visible = useMemo(() => {
    return CATALOG.map((item, index) => ({ item, index })).filter(({ item }) =>
      matchesQuery(item, normalized),
    );
  }, [normalized]);
  visibleRef.current = visible;

  const maxIndex = Math.max(CATALOG.length - 1, 0);

  const syncPad = () => {
    const root = scrollerRef.current;
    if (!root) return;
    const rowH = rowRefs.current.find(Boolean)?.offsetHeight ?? 56;
    const trackH = visibleRef.current.length * rowH;
    const needsScroll = trackH > root.clientHeight + 8;
    setPadEndPx(needsScroll ? Math.max(0, root.clientHeight - rowH) : 0);
  };

  /** Focus line is the TOP of the list panel (under the 3D hero). */
  const paintFocus = () => {
    const root = scrollerRef.current;
    if (!root) return;
    const list = visibleRef.current;
    if (list.length === 0) return;

    let bestCatalog = list[0]!.index;
    let bestDist = Infinity;

    for (const { index } of list) {
      const row = rowRefs.current[index];
      if (!row) continue;
      const dist = Math.abs(row.offsetTop - root.scrollTop);
      const norm = Math.min(1, dist / (row.offsetHeight * 1.6));
      row.style.opacity = String(Math.max(0.3, 1 - norm * 0.58));
      row.classList.toggle("is-active", norm < 0.42);
      if (dist < bestDist) {
        bestDist = dist;
        bestCatalog = index;
      }
    }

    if (bestCatalog !== activeIndexRef.current) {
      activeIndexRef.current = bestCatalog;
      setActiveIndex(bestCatalog);
      setFloatIndex(bestCatalog);
      setScrollProgress(maxIndex === 0 ? 0 : bestCatalog / maxIndex);
    }
  };

  const schedulePaint = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      paintFocus();
    });
  };

  useEffect(() => {
    activeIndexRef.current = 0;
    setActiveIndex(0);
    setFloatIndex(0);
    setScrollProgress(0);
    setBooted(true);
  }, [setActiveIndex, setFloatIndex, setScrollProgress]);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void fetch("/api/plays", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!alive || !data?.counts) return;
          setPlays(data.counts as PlayCounts);
        })
        .catch(() => {});
    };
    refresh();
    const id = window.setInterval(refresh, 15000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  // Refresh counts soon after a new track starts playing.
  useEffect(() => {
    if (!trackUrl || status !== "playing") return;
    const id = window.setTimeout(() => {
      void fetch("/api/plays", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.counts) return;
          setPlays(data.counts as PlayCounts);
        })
        .catch(() => {});
    }, 600);
    return () => window.clearTimeout(id);
  }, [trackUrl, status]);

  function scrollToIndex(index: number, behavior: ScrollBehavior = "smooth") {
    const root = scrollerRef.current;
    const row = rowRefs.current[index];
    if (!root || !row) return;
    root.scrollTo({ top: Math.max(0, row.offsetTop), behavior });
  }

  function focusPlayingOrFirst(behavior: ScrollBehavior = "auto") {
    const playingIdx = trackUrl
      ? CATALOG.findIndex((t) => t.audio === trackUrl)
      : -1;
    const playingVisible =
      playingIdx >= 0 &&
      visibleRef.current.some((entry) => entry.index === playingIdx);
    const target = playingVisible
      ? playingIdx
      : (visibleRef.current[0]?.index ?? -1);
    if (target < 0) return;
    scrollToIndex(target, behavior);
    activeIndexRef.current = target;
    setActiveIndex(target);
    setFloatIndex(target);
    setScrollProgress(maxIndex === 0 ? 0 : target / maxIndex);
    schedulePaint();
  }

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || !booted) return;

    requestAnimationFrame(() => {
      syncPad();
      focusPlayingOrFirst("auto");
      paintFocus();
    });

    const onResize = () => {
      syncPad();
      schedulePaint();
    };

    root.addEventListener("scroll", schedulePaint, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      root.removeEventListener("scroll", schedulePaint);
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted, normalized, visible.length]);

  // Auto-scroll playlist when the playing track changes (manual select or auto-next).
  useEffect(() => {
    if (!booted || !trackUrl) return;
    const index = CATALOG.findIndex((t) => t.audio === trackUrl);
    if (index < 0) return;

    const visibleHit = visibleRef.current.some((entry) => entry.index === index);
    if (!visibleHit && normalized) {
      setQuery("");
      setSearchOpen(false);
      return;
    }

    requestAnimationFrame(() => {
      syncPad();
      scrollToIndex(index, "smooth");
      activeIndexRef.current = index;
      setActiveIndex(index);
      setFloatIndex(index);
      setScrollProgress(maxIndex === 0 ? 0 : index / maxIndex);
      schedulePaint();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackUrl, booted]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(engine.getCurrentTime());
      setDuration(engine.getDuration());
    }, 200);
    return () => window.clearInterval(id);
  }, [engine]);

  useEffect(() => {
    if (searchOpen) {
      searchRef.current?.focus();
    }
  }, [searchOpen]);

  async function onSelect(index: number) {
    const item = CATALOG[index];
    if (!item) return;

    scrollToIndex(index);
    activeIndexRef.current = index;
    setActiveIndex(index);

    if (!item.audio) return;

    const playingThis = status === "playing" && trackUrl === item.audio;
    if (playingThis) {
      pause();
      return;
    }
    if (trackUrl !== item.audio) {
      await load(item.audio);
    }
    await play();
  }

  async function onMiniToggle() {
    const item = playingItem ?? release;
    if (!item.audio) return;
    if (status === "playing" && trackUrl === item.audio) {
      pause();
      return;
    }
    if (trackUrl !== item.audio) {
      await load(item.audio);
    }
    await play();
  }

  async function onStep(delta: -1 | 1) {
    const base =
      playingItem != null
        ? CATALOG.findIndex((t) => t.id === playingItem.id)
        : activeIndex;
    const next = Math.min(CATALOG.length - 1, Math.max(0, base + delta));
    if (next === base) return;
    // Clear search so prev/next can reach full catalog
    if (normalized) {
      setQuery("");
      setSearchOpen(false);
    }
    await onSelect(next);
  }

  function closeSearch() {
    setQuery("");
    setSearchOpen(false);
  }

  return (
    <main className="music-page relative h-dvh w-full overflow-hidden text-white">
      <div className="music-bg" aria-hidden>
        <div className="music-bg__haze" />
        <div className="music-bg__grain" />
        <div className="music-bg__vignette" />
      </div>

      <div className="music-hero pointer-events-none absolute z-[1]">
        {booted ? <Experience liftY={0.82} worldScale={0.88} /> : null}
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 safe-area-pad px-4 pt-3 md:px-6 md:pt-4">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="brand-mark pointer-events-auto">
            VAFACCI
          </Link>

          <div
            className={`music-search-wrap pointer-events-auto${searchOpen ? " is-open" : ""}`}
          >
            {searchOpen ? (
              <div className="music-search">
                <input
                  ref={searchRef}
                  className="music-search__input"
                  type="search"
                  inputMode="search"
                  enterKeyHint="done"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      closeSearch();
                      return;
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      searchRef.current?.blur();
                      if (!query.trim()) closeSearch();
                    }
                  }}
                  onBlur={() => {
                    if (!query.trim()) closeSearch();
                  }}
                  placeholder="Search"
                  aria-label="Search tracks"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="music-search__clear"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={closeSearch}
                  aria-label="Close search"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="music-kicker music-kicker--btn"
                onClick={() => setSearchOpen(true)}
              >
                Search
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="music-dock pointer-events-none absolute inset-x-0 bottom-0 z-10">
        <div className="music-list-shell pointer-events-auto">
          <div className="music-focus-rail" aria-hidden>
            <div className="music-focus-rail__line" />
          </div>

          <div ref={scrollerRef} className="music-list">
            <div className="music-list__track">
              {visible.length === 0 ? (
                <p className="music-search-empty">No tracks found</p>
              ) : (
                visible.map(({ item, index }) => {
                  const playingThis =
                    status === "playing" &&
                    !!item.audio &&
                    trackUrl === item.audio;

                  return (
                    <button
                      key={item.id}
                      ref={(node) => {
                        rowRefs.current[index] = node;
                      }}
                      type="button"
                      className={`music-row${playingThis ? " is-playing" : ""}`}
                      onClick={() => void onSelect(index)}
                      aria-label={
                        item.audio
                          ? `${playingThis ? "Pause" : "Play"} ${item.title}`
                          : `${item.title}, coming soon`
                      }
                    >
                      <span className="music-row__index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="music-row__body">
                        <span className="music-row__title">{item.shortTitle}</span>
                        <span className="music-row__meta">
                          {playingThis ? "Playing" : item.title}
                        </span>
                      </span>
                      <span className="music-row__end">
                        <span
                          className="music-row__plays"
                          title={`${plays[item.id] ?? 0} plays`}
                        >
                          {formatPlays(plays[item.id] ?? 0)}
                        </span>
                        <span className="music-row__duration">
                          {item.duration ?? "—:—"}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div
              className="music-list__pad-end"
              style={{ height: padEndPx }}
              aria-hidden
            />
          </div>
        </div>

        <div className="music-mini pointer-events-auto safe-area-pad px-4 pb-3 md:px-6 md:pb-4">
          <div className="music-mini__bar">
            <div className="music-mini__info">
              <p className="music-mini__title">{miniTitle}</p>
              <p className="music-mini__time">
                {playingItem
                  ? `${formatTime(now)} / ${duration > 0 ? formatTime(duration) : (playingItem.duration ?? "0:00")}`
                  : `${CATALOG.length} tracks`}
              </p>
            </div>

            <div className="music-mini__controls">
              <button
                type="button"
                className="music-mini__ctrl"
                onClick={() => void onStep(-1)}
                aria-label="Previous track"
                disabled={
                  (playingItem != null
                    ? CATALOG.findIndex((t) => t.id === playingItem.id)
                    : activeIndex) <= 0
                }
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M15.5 6.5L9 12l6.5 5.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="music-mini__ctrl music-mini__ctrl--play"
                onClick={() => void onMiniToggle()}
                aria-label={isPlaying ? "Pause" : "Play"}
                disabled={!release.audio && !playingItem?.audio}
              >
                {isPlaying ? (
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <rect x="7" y="6" width="3.2" height="12" fill="currentColor" />
                    <rect x="13.8" y="6" width="3.2" height="12" fill="currentColor" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M9 7.2v9.6L17.2 12z" fill="currentColor" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className="music-mini__ctrl"
                onClick={() => void onStep(1)}
                aria-label="Next track"
                disabled={
                  (playingItem != null
                    ? CATALOG.findIndex((t) => t.id === playingItem.id)
                    : activeIndex) >= CATALOG.length - 1
                }
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M8.5 6.5L15 12l-6.5 5.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <input
              className="player-seek music-mini__seek"
              type="range"
              min={0}
              max={duration || 1}
              step={0.01}
              value={Number.isFinite(now) ? now : 0}
              disabled={!playingItem?.audio && !release.audio}
              onChange={(e) => seek(Number(e.target.value))}
              style={{ "--progress": `${progress}%` } as CSSProperties}
              aria-label="Seek"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
