# Human Photobooth (ghost-booth)

A deliberately simple Halloween photobooth web app. Nic wears an iPad on his
chest (screen facing guests) and acts as a "Human Photobooth". Inspired by the
Simple Booth Halo app: tap, countdown, one framed photo, print.

The previous, much larger version (face detection, caricature warps, filters,
ghost cameo, operator panel) was intentionally removed in Oct 2026. It lives on
the `backup-before-simple-rebuild` branch. Don't bring features back unless asked.

## Flow
attract (live mirrored front camera, tap anywhere) -> countdown -> review
(framed photo; Print / Retake / Done) -> sent -> back to attract.
Review auto-resets after 90s. Hold the title for 2s to open hidden settings
(print title, second line, countdown length, rotation flip).

## Printing
Printer is a Kodak Mini 2 Retro (Bluetooth, Kodak app only). Safari cannot
reach it directly (no Web Bluetooth, no AirPrint). Print opens the iOS share
sheet with ONLY the image file; Nic's "Print to Kodak" Shortcut (Show in Share
Sheet) saves it and opens the Kodak app. Never add title/text to
navigator.share: they become junk items in the Shortcut.

## Print layout
1200x1800 JPEG (2:3 portrait). Keep everything inside the 70px safe margin;
the Kodak app may trim edges. See src/layout.ts.

## iPad quirks handled
- getUserMedia asks for a portrait-shaped stream (1440x1920 hint).
- Some iPads return a sideways frame from canvas capture even though the
  preview looks right; grabFrame rotates when frame and screen orientation
  disagree. Settings has a flip if it comes out upside down.
- iOS stops the camera when switching to the Kodak app; it restarts on
  visibilitychange.

## Stack and deploy
Vite + plain TypeScript, no framework. `npm test`, `npm run lint`,
`npm run build`. Pushing to `main` runs .github/workflows/deploy.yml, which
publishes dist/ to the gh-pages branch: https://nicf8814.github.io/ghost-booth/
