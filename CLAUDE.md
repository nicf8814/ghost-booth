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
- kristen-cutout.png: a close-up of Kristen Nic supplied (Nov 2, already cut out), cropped above
  a mute-icon overlay that was baked into the bottom corner, shrunk to 700px wide. Peeks in
  from the left edge (the spot Nic's own ghost used to have; Nic's ghost was removed Nov 2).
- kristen-ryan-cutout.png: Kristen and Ryan together in red circus costumes (Nov 2, already cut
  out), cropped to the two figures, 520px wide. Stands near the right border (about 25% of the
  figure past the photo edge), heads high, bodies fade out below the waist.
- ghost-bride.png: a bride photo Nic supplied (Oct 24), cut out with rembg
  and cropped head through the full bouquet. Stands upright (no tilt) along the
  right edge with about a quarter of her off the edge (Nic asked for both).
- victorian-man.png / victorian-woman.png: an AI-made Victorian couple Nic
  created, cut out with rembg and split in two. They haunt the top-left and
  top-right corners so the middle stays clear for guests' faces (Nic asked
  for this after they covered too much). Dark clothing fades away so faces
  and collars glow. Kristen and the bride move lower when the pair is on.
Contrast: ghosts adapt to the wall behind them. On a bright wall (a pale ghost
has nothing to stand out against) each ghost gets a soft dark-indigo halo and an
indigo glow; on a dark wall it keeps the pale icy glow. The backdrop brightness is
measured in src/frame.ts and the halo is built in src/ghost.ts. The couple's dark
clothing is kept at about half strength so the figures read as bodies, not just faces.
- ryan-cutout.png: a photo of Ryan Nic supplied (Nov 2, already cut out by Nic), cropped head
  through chest. Peeks in from the right edge, tilted the other way from Kristen.
- clinton-cutout.png: a full-body Clinton pose Nic supplied (Nov 2, already cut out), arms spread,
  cropped to the figure with 90px of empty margin left and right so the side feather fades air
  instead of his hands. Floats along the bottom of the photo, legs fade away.
The review button cycles: none -> the bride -> the Victorian couple -> Ryan -> Clinton -> Kristen
-> Kristen and Ryan -> "everyone" (now just the bride and the Victorian couple).
No cobweb on the frame (Nic asked to remove it). Settings
modes: "toggle" (default), "random", "off".
Random mode odds (src/ghost.ts, `RANDOM_GHOST_CHANCE` and `RANDOM_GHOSTS`, tested in
tests/ghost.test.ts): 75% of photos get a ghost (25% get none). Shares of ALL photos: Clinton,
Ryan and Kristen 10% each; the bride, the Victorian couple and Kristen and Ryan 15% each. Each
`weight` in RANDOM_GHOSTS is that ghost's percent of all photos (keep them adding up to 75). "Everyone" is never picked at random.
In random mode the plain photo shows first with Print disabled; about 0.45s
later (REVEAL_DELAY_MS in src/main.ts) a quick preview with the ghost fades in on top
over 1.8s (`#result-ghost`) while the full-size print file is built, then Print unlocks. The "Add a ghost" button only shows in "toggle" mode.
At the end of every countdown one of our created ghosts swoops across the screen in 1.4s
(SWOOP_MS in src/main.ts, starting half a second before the last second and gone 0.1s before
the photo) with a pale-blue glow (`#pop`). It is picked at random from the bride, Victorian man,
Victorian woman, Ryan, Clinton, Kristen and Kristen and Ryan (`SWOOP_GHOSTS` in src/main.ts),
never the same one twice in a row; the plain white ghost is the fallback if the pictures
are not ready yet. It is only on screen, never in the photo.

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
