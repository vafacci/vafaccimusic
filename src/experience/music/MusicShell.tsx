"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CATALOG } from "@/data/catalog";
import { useAudioStore } from "@/experience/audio/audioStore";
import { ensureMediaSession } from "@/experience/audio/mediaSession";
import { formatPlays, type PlayCounts } from "@/lib/playStats";
import { ShowTitle } from "@/experience/ui/ShowTitle";
import { SeekBar } from "@/experience/ui/SeekBar";
import { TrackMoreMenu } from "./TrackMoreMenu";
import { useMusicGalleryStore } from "./musicStore";

const MusicScene = dynamic(
  () => import("./MusicScene").then((m) => m.MusicScene),
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
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const visibleRef = useRef<{ item: (typeof CATALOG)[number]; index: number }[]>(
    [],
  );

  const activeIndex = useMusicGalleryStore((s) => s.activeIndex);
  const setScrollProgress = useMusicGalleryStore((s) => s.setScrollProgress);
  const setFloatIndex = useMusicGalleryStore((s) => s.setFloatIndex);
  const setActiveIndex = useMusicGalleryStore((s) => s.setActiveIndex);

  const status = useAudioStore((s) => s.status);
  const trackUrl = useAudioStore((s) => s.trackUrl);
  const load = useAudioStore((s) => s.load);
  const play = useAudioStore((s) => s.play);
  const pause = useAudioStore((s) => s.pause);

  const [booted, setBooted] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [plays, setPlays] = useState<PlayCounts>({});
  const pageRef = useRef<HTMLElement>(null);

  const release = CATALOG[activeIndex] ?? CATALOG[0]!;
  const playingItem = trackUrl
    ? (CATALOG.find((t) => t.audio && t.audio === trackUrl) ?? null)
    : null;
  const isPlaying = status === "playing";
  const miniTitle = playingItem?.title ?? release.title;
  const canPrev =
    (playingItem != null
      ? CATALOG.findIndex((t) => t.id === playingItem.id)
      : activeIndex) > 0;
  const canNext =
    (playingItem != null
      ? CATALOG.findIndex((t) => t.id === playingItem.id)
      : activeIndex) < CATALOG.length - 1;

  const normalized = query.trim().toLowerCase();
  const visible = useMemo(() => {
    return CATALOG.map((item, index) => ({ item, index })).filter(({ item }) =>
      matchesQuery(item, normalized),
    );
  }, [normalized]);
  visibleRef.current = visible;

  const maxIndex = Math.max(CATALOG.length - 1, 0);

  function markActive(index: number) {
    setActiveIndex(index);
    setFloatIndex(index);
    setScrollProgress(maxIndex === 0 ? 0 : index / maxIndex);
  }

  useEffect(() => {
    ensureMediaSession();

    const params = new URLSearchParams(window.location.search);
    const trackId = params.get("track");
    const fromLink = trackId
      ? CATALOG.findIndex((t) => t.id === trackId)
      : -1;
    const startIndex = fromLink >= 0 ? fromLink : 0;

    markActive(startIndex);
    setBooted(true);

    // Deep link: open the exact shared track
    if (fromLink >= 0) {
      const item = CATALOG[fromLink];
      if (item?.audio) {
        void load(item.audio)
          .then(() => play())
          .catch(() => {
            // autoplay may be blocked; track is still loaded/focused
          });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, play, setActiveIndex, setFloatIndex, setScrollProgress]);

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
    const row = rowRefs.current[index];
    if (!row) return;
    row.scrollIntoView({ behavior, block: "nearest" });
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
    markActive(target);
  }

  useEffect(() => {
    if (!booted) return;
    requestAnimationFrame(() => {
      focusPlayingOrFirst("auto");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted, normalized, visible.length]);

  // Keep the playing track in view on auto-next / deep link.
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
      scrollToIndex(index, "smooth");
      markActive(index);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackUrl, booted]);

  useEffect(() => {
    if (searchOpen) {
      searchRef.current?.focus();
    }
  }, [searchOpen]);

  async function onSelect(index: number) {
    const item = CATALOG[index];
    if (!item) return;

    scrollToIndex(index);
    markActive(index);

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
    <main
      ref={pageRef}
      className="music-page relative h-dvh w-full overflow-hidden text-white"
    >
      <div className="music-bg" aria-hidden>
        <div className="music-bg__stars">
          {booted ? <MusicScene /> : null}
        </div>
        <div className="music-bg__haze" />
        <div className="music-bg__grain" />
        <div className="music-bg__vignette" />
      </div>

      <header className="music-header pointer-events-none">
        <div className="music-header__bar">
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

      <div className="music-stage">
        <div className="music-playlist">
          <div className="music-list-shell">
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
                    const loadedThis = !!item.audio && trackUrl === item.audio;

                    return (
                      <div
                        key={item.id}
                        ref={(node) => {
                          rowRefs.current[index] = node;
                        }}
                        className={`music-row${playingThis ? " is-playing" : ""}${loadedThis ? " is-current" : ""}`}
                      >
                        <button
                          type="button"
                          className="music-row__main"
                          onClick={() => void onSelect(index)}
                          aria-label={
                            item.audio
                              ? `${playingThis ? "Pause" : "Play"} ${item.title}`
                              : `${item.title}, coming soon`
                          }
                        >
                          <span className="music-row__index">{index + 1}</span>
                          <span className="music-row__body">
                            <span className="music-row__title">
                              {item.shortTitle}
                            </span>
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
                        <TrackMoreMenu track={item} />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="music-mini">
          <div className="music-mini__bar">
            <div className="music-mini__top">
              <ShowTitle title={miniTitle} />
              <div className="music-mini__controls">
                <button
                  type="button"
                  className="music-mini__ctrl"
                  onClick={() => void onStep(-1)}
                  aria-label="Previous track"
                  disabled={!canPrev}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M18.5 6.5v11L9 12l9.5-5.5zM6.5 6.5v11"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
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
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M8 7h2.2v10H8V7zM13.8 7H16v10h-2.2V7z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M9 7.5v9l8-4.5-8-4.5z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  className="music-mini__ctrl"
                  onClick={() => void onStep(1)}
                  aria-label="Next track"
                  disabled={!canNext}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M5.5 6.5v11L15 12 5.5 6.5zM17.5 6.5v11"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <SeekBar
              className="music-mini__seek"
              disabled={!playingItem?.audio && !release.audio}
              showTimes
            />
          </div>
        </div>
      </div>
    </main>
  );
}
