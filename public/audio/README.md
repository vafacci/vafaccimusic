# Audio assets

VAFACCI tracks served from `/audio/*`.

## Adding a new track

1. Drop the source MP3 in `/assets`.
2. Copy it here with a URL-safe name, e.g. `hold-ud-ft-facci-farli.mp3`.
3. **Prepend** a new entry at the **top** of `src/data/catalog.ts`
   (newest first — that is what `/music` shows first).
4. Commit `public/audio/<file>.mp3` + the catalog change and push.
