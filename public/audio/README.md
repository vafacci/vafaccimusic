# Audio assets

VAFACCI tracks served from `/audio/*`.

## Adding a new track

### In the browser (preferred)
1. Open `/music` (Tracks).
2. Drop an mp3/wav onto **Drop track here** (or tap to choose).
3. The file uploads to Vercel Blob and appears at the top of the playlist.

### Manually (seed catalog)
1. Drop the source MP3 in `/assets`.
2. Copy it here with a URL-safe name, e.g. `tinetus-k4bz.mp3`.
3. **Prepend** a new entry at the **top** of `src/data/catalog.ts`
   (newest first — that is what `/music` shows first).
4. Commit `public/audio/<file>.mp3` + the catalog change and push.
