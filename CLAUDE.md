# Human Photobooth (ghost-booth)

A deliberately simple Halloween photobooth web app. Nic wears an iPad on his
chest (screen facing guests) and acts as a "Human Photobooth". Inspired by the
Simple Booth Halo app: tap, countdown, one framed photo, print.

The previous, much larger version (face detection, caricature warps, filters,
operator panel) was intentionally removed in Oct 2026. It lives on
the `backup-before-simple-rebuild` branch. Don't bring features back unless asked.

## Flow
attract (live mirrored front camera, timer chips 3/7/10s, tap anywhere else to start) -> countdown -> review
(framed photo; Print / Retake / Done, plus Save HD which shares a 2560x3840 copy of the same framed photo, pre-rendered in the background; can be hidden in settings) -> sent -> back to attract.
Review auto-resets after 90s. Tap the small gear (top right of the landing screen) or hold the title for 2s to open settings
(text on print and screen, default timer, photo rotation, ghost cameo mode).

## Ghost cameo
Cutouts in public/cameo/, turned into see-through icy-blue ghosts by
src/ghost.ts:
- nic-cutout.png: Nic's face, small, peeking in from the left edge.
- ghost-bride.png: a bride photo Nic supplied (Oct 24), cut out with rembg
  and cropped head through the full bouquet. Stands upright (no tilt) along the
  right edge with about a quarter of her off the edge (Nic asked for both).
- victorian-man.png / victorian-woman.png: an AI-made Victorian couple Nic
  created, cut out with rembg and split in two. They haunt the top-left and
  top-right corners so the middle stays clear for guests' faces (Nic asked
  for this after they covered too much). Dark clothing fades away so faces
  and collars glow. Nic and the bride move lower when the pair is on.
The review button cycles: none -> Nic -> the bride -> the couple -> everyone.
No cobweb on the frame (Nic asked to remove it). Settings
modes: "toggle" (default), "random" (about half of photos get a random ghost
choice; Nic plans to switch to this eventually), "off".

## Photo borders
Chosen in hidden settings ("Photo border"); the default is Classic. Styles live
in src/frames.ts: classic (dark, orange outline, bats), parchment (texture plus
black ink ornaments) and filigree (dark linework on cream). Pictures are in
public/frames/ (parchment.jpg, parchment-ink.png, filigree.png), all 0.707 wide
to tall and stretched slightly to the 2:3 print. The ornament pictures are drawn
OVER the photo so corners can overlap it. To move the photo or caption inside a
border, edit that style's `photo`, `captionTop` and `captionBottom` in frames.ts
(1200x1800 print coordinates). The HD copy reuses the same border.

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
- getUserMedia asks for a portrait-shaped stream (tries strict 3:4 sizes 2160x2880, then 1920x2560, then 1440x1920; a loose request once returned a near-square 2160x2316 frame that cropped 18% off the sides; settings shows what it actually sent), capped at
  30fps to keep the iPad cooler and save battery.
- Safari returns upright frames; auto-rotation was removed after it turned an
  upright iPhone photo sideways. Settings has a manual "Photo rotation"
  override (Normal / Turn right / Turn left) if a device ever needs it.
- iOS stops the camera when switching to the Kodak app; it restarts on
  visibilitychange.

## Stack and deploy
Vite + plain TypeScript, no framework. `npm test`, `npm run lint`,
`npm run build`. Pushing to `main` runs .github/workflows/deploy.yml, which
publishes dist/ to the gh-pages branch: https://nicf8814.github.io/ghost-booth/
