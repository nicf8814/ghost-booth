# Ghost Booth

A full-screen, unattended Halloween photobooth web app for iPad Safari. See `CLAUDE.md` for
the full product spec and phased build plan this project follows, and `PROJECT_LOG.md` for
the detailed, continuously-updated "what actually happened and why" history — this README
stays intentionally high-level so it doesn't go stale the way a blow-by-blow feature log
would; check PROJECT_LOG.md for the real detail on any item below.

## Status: Phases 1–4 and 8 complete, Phase 9 mostly done (beta)

- **Phase 1 (Shell), 2 (Camera), 3 (Vision)** — done. Single `BoothState` state machine, no
  scattered booleans; `getUserMedia` camera with full permission/hardware error handling and
  deliberate un-mirroring so nothing prints horizontally reversed; face detection + 68-point
  landmarks via `@vladmandic/face-api` running fully offline in a Web Worker.
- **Phase 4 (Caricature)** — done. Every deformation the spec lists (nose, eyes, jaw, ears,
  mouth, forehead, cheeks, eyebrows, plus shoulder/body approximations) is wired up through a
  WebGL2 mesh warp with a Canvas2D fallback. `faceWidth`/`faceHeight`/`neckScale` remain
  unwired (would need an anisotropic warp the current spherize math doesn't support).
- **Phase 5 (GPU)** — done as a byproduct of Phase 4 (the WebGL2/Canvas2D renderers are
  generic, not feature-specific).
- **Phase 6 (Segmentation) / 7 (Ghost)** — tried and reverted. A live per-guest ghost effect
  (real person segmentation) didn't look good enough and was replaced with "My Cameo": the
  booth owner's own bundled cutout photo(s), composited in as a recurring ghostly photobomb.
- **Phase 8 (Composition)** — done. Captions, procedurally-drawn frames, all 16 Halloween
  overlay types (also procedural — no raster assets to source/license), and a "Poster Mode"
  color-grade treatment are all implemented and independently toggleable by the guest on the
  result screen (Goofy, Spookify, Frame, Overlays, Poster, Caption — plus a one-tap "Original"
  to revert everything).
- **Phase 9 (Printing)** — the real hardware is known (Kodak Mini 2 Retro) and a Share-Sheet
  adapter is built and default, but it's not yet verified against the physical printer.
- **Phase 10 (Booth mode / auto-detection)** — not started; the booth currently requires a tap
  to begin.

## Running it

```bash
npm install
npm run dev       # http://localhost:5173, camera works on localhost without HTTPS
npm run test      # unit tests (state machine, mesh warp math + GL call reuse, landmark
                   # normalization, print layout cropping)
npm run lint       # oxlint
npm run build      # type-checks (tsc -b) and produces dist/
```

On an actual iPad you'll need HTTPS (camera access requires it outside localhost) and to
open the app in Safari; "Add to Home Screen" gives you the standalone/full-screen mode.

## Known gaps (see PROJECT_LOG.md's "Open threads" for the full, current list)

- No offline service worker yet — the spec's Phase-45 "must keep working without network
  after install" requirement isn't met.
- The `photoRetentionMinutes` operator setting doesn't do anything yet (the IndexedDB
  purge logic exists in `storage/PhotoStore.ts` but isn't called anywhere).
- No explicit `ImageBitmap.close()` calls anywhere in the capture pipeline — fine for a short
  test session, worth addressing before a multi-hour unattended event given how aggressively
  iPad Safari reclaims memory under pressure.
- Real printer hardware (Kodak Mini 2 Retro) is wired up but not yet hands-on verified.
- Auto-detection/unattended start (Phase 10) isn't built.

## Live deployment

Hosted on GitHub Pages from the `gh-pages` branch. Redeploy procedure is in
`PROJECT_LOG.md`'s "Deploy procedure" section.
