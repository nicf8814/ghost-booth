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
Contrast: ghosts adapt to the wall behind them. On a bright wall (a pale ghost
has nothing to stand out against) each ghost gets a soft dark-indigo halo and an
indigo glow; on a dark wall it keeps the pale icy glow. The backdrop brightness is
measured in src/frame.ts and the halo is built in src/ghost.ts. The couple's dark
clothing is kept at about half strength so the figures read as bodies, not just faces.
- ryan-cutout.png: a photo of Ryan Nic supplied (Nov 2, already cut out by Nic), cropped head
  through chest. Peeks in from the right edge, tilted the other way from Nic.
- clinton-cutout.png: a full-body Clinton pose Nic supplied (Nov 2, already cut out), arms spread,
  cropped to the figure with 90px of empty margin left and right so the side feather fades air
  instead of his hands. Hovers across the top of the photo, legs fade away.
  Ryan and Clinton are only on the button cycle, not in random mode or "everyone".
The review button cycles: none -> Nic -> the bride -> the couple -> Ryan -> Clinton -> everyone.
No cobweb on the frame (Nic asked to remove it). Settings
modes: "toggle" (default), "random" (about half of photos get a random ghost
choice; Nic plans to switch to this eventually), "off".
Random mode odds (src/ghost.ts, `pickRandomGhost`, tested in tests/ghost.test.ts): 60% of
photos get a ghost; of those, the Victorian couple 40%, the bride 40%, Nic 20% (never
"everyone"). In random mode the plain photo shows first with Print disabled; about 0.45s
later (REVEAL_DELAY_MS in src/main.ts) a quick preview with the ghost fades in on top
over 1.8s (`#result-ghost`) while the full-size print file is built, then Print unlocks. The "Add a ghost" button only shows in "toggle" mode.
In the last second of every countdown a ghost swoops across the screen with a pale-blue
glow (`#pop`); it is only on screen, never in the photo.

## Photo border
There is one border: dark filigree linework on cream (public/frames/filigree.png,
0.707 wide to tall, stretched slightly to the 2:3 print). Nic compared three
styles on Oct 31 (the original dark/orange frame with bats, a Victorian
parchment, and this one), picked filigree, and asked for the others to be removed.
They are still in git history (commit dcae121 and earlier) if ever wanted back.
The ornament picture is drawn OVER the photo so its corners overlap it. Photo and
caption positions are in src/frames.ts (1200x1800 print coordinates). The
"Photo edges" setting: soft (default) fades the photo's edges into the paper
(`soft.photo`, `soft.feather`); sharp keeps a thin outline (`photo`). The HD copy
uses the same border. Old saved settings with `frame` or `framePicker` are ignored.

## Caption lettering
Nic's hand lettering (public/frames/title.svg, from his HEISTERKAMP_HALLOWEN.svg) is drawn for the default title "Heisterkamp Halloween...". His original spelled the second line "HALLOWEN" (one E); I duplicated an E glyph and re-centered it. Any other title text falls back to the Creepster font.

## Printing
Printer is a Kodak Mini 2 Retro (Bluetooth, Kodak app only). Safari cannot
reach it directly (no Web Bluetooth, no AirPrint). Print opens the iOS share
sheet with ONLY the image file; Nic's "Print to Kodak" Shortcut (Show in Share
Sheet) saves it and opens the Kodak app. Never add title/text to
navigator.share: they become junk items in the Shortcut.

## Print layout
1200x1800 JPEG (2:3 portrait). The Kodak app may trim a little off the edges;
the filigree corner ornaments reach close to the edge, so check a real print for
clipped corners. See src/layout.ts and src/frames.ts.

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
