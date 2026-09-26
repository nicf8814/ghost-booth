HALLOWEEN GHOST BOOTH — CLAUDE.md

Product

Build a full-screen, unattended Halloween photobooth web app designed to run in Safari on an iPad.

The iPad provides:

• touchscreen UI
• front-facing camera
• display
• browser runtime

A separate mobile photo printer provides physical prints.

The app should feel like a haunted, slightly inappropriate adult Halloween attraction: funny, suggestive, irreverent, and cartoonish, but not pornographic or explicitly sexual.

The core experience:

ATTRACT SCREEN
    ↓
LIVE CAMERA
    ↓
MODE SELECTION / AUTO START
    ↓
COUNTDOWN
    ↓
CAPTURE
    ↓
FACE + PERSON ANALYSIS
    ↓
CARICATURE + GHOST EFFECTS
    ↓
HALLOWEEN COMPOSITION
    ↓
RESULT
    ↓
PRINT
    ↓
RESET

────────

1. WEB-APP ARCHITECTURE

This is a browser application, NOT a native iPad application.

Recommended stack:

• TypeScript
• React
• Vite
• CSS
• Web APIs
• MediaDevices / getUserMedia
• Canvas 2D
• WebGL2
• WebGPU where available
• Web Workers
• OffscreenCanvas where supported
• IndexedDB for temporary local storage
• PWA/service worker for offline shell

Prefer browser-native APIs over unnecessary dependencies.

The application must work without a backend for the core booth experience.

Do not require an internet connection for:

• camera preview
• photo capture
• face analysis
• caricature effects
• ghost effects
• Halloween overlays
• local rendering
• basic printing

────────

2. IMPORTANT WEB PLATFORM CONSTRAINTS

The app must account for browser restrictions.

Camera access requires HTTPS except for localhost.

Use:

navigator.mediaDevices.getUserMedia()

The camera permission should be requested during booth setup, not when guests are waiting.

The app should run in full-screen/standalone PWA mode where possible.

Do not assume the browser can directly control every Bluetooth photo printer.

Printer support MUST be abstracted.

Some printers may work through:

• AirPrint
• browser/system print dialog
• vendor bridge
• local print service
• Wi-Fi printer API
• Web Bluetooth, only if the exact printer/browser combination supports it

Do not promise generic direct Bluetooth printing from Safari.

The exact printer model determines the implementation.

────────

3. PROJECT STRUCTURE

Use this structure:

ghost-booth/
│
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── AppState.ts
│   │   └── routes.ts
│   │
│   ├── components/
│   │   ├── AttractScreen.tsx
│   │   ├── CameraScreen.tsx
│   │   ├── Countdown.tsx
│   │   ├── ProcessingScreen.tsx
│   │   ├── ResultScreen.tsx
│   │   ├── PrintingScreen.tsx
│   │   ├── OperatorPanel.tsx
│   │   └── UI/
│   │
│   ├── camera/
│   │   ├── CameraManager.ts
│   │   ├── CaptureService.ts
│   │   └── CameraPreview.tsx
│   │
│   ├── vision/
│   │   ├── FaceDetector.ts
│   │   ├── FaceLandmarks.ts
│   │   ├── PersonSegmentation.ts
│   │   └── VisionTypes.ts
│   │
│   ├── effects/
│   │   ├── EffectEngine.ts
│   │   ├── CaricatureEngine.ts
│   │   ├── GhostEngine.ts
│   │   ├── MeshWarp.ts
│   │   ├── HalloweenEffects.ts
│   │   └── Presets.ts
│   │
│   ├── rendering/
│   │   ├── CanvasRenderer.ts
│   │   ├── WebGLRenderer.ts
│   │   ├── WebGPURenderer.ts
│   │   ├── shaders/
│   │   └── CompositionEngine.ts
│   │
│   ├── printing/
│   │   ├── PrinterManager.ts
│   │   ├── PrinterAdapter.ts
│   │   ├── BrowserPrintAdapter.ts
│   │   ├── AirPrintAdapter.ts
│   │   └── VendorPrinterAdapter.ts
│   │
│   ├── storage/
│   │   ├── PhotoStore.ts
│   │   ├── SettingsStore.ts
│   │   └── IndexedDB.ts
│   │
│   ├── state/
│   │   └── BoothStateMachine.ts
│   │
│   ├── config/
│   │   └── effects.json
│   │
│   └── utils/
│       ├── image.ts
│       ├── orientation.ts
│       ├── random.ts
│       └── logger.ts
│
├── public/
│   ├── overlays/
│   ├── frames/
│   ├── sounds/
│   ├── fonts/
│   ├── icons/
│   └── manifest.webmanifest
│
├── tests/
│
├── CLAUDE.md
├── package.json
├── vite.config.ts
└── README.md

────────

4. STATE MACHINE

Use one authoritative booth state.

type BoothState =
  | "attract"
  | "camera"
  | "ready"
  | "countdown"
  | "capturing"
  | "processing"
  | "result"
  | "printing"
  | "printComplete"
  | "error";

Do not create dozens of unrelated booleans such as:

isLoading
isPrinting
isProcessing
showResult
showCamera
showCountdown

Use the state machine.

────────

5. CAMERA

Use:

navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: "user",
    width: { ideal: 1920 },
    height: { ideal: 1080 }
  },
  audio: false
})

Handle:

• permission denied
• camera unavailable
• camera already in use
• unsupported browser
• orientation changes
• iPad Safari quirks

The live preview may be mirrored.

The final photograph must have a deliberate orientation policy.

Do not accidentally print a horizontally reversed photograph.

────────

6. CAMERA COMPONENT

Create a reusable camera service.

Example API:

interface CameraManager {
  start(): Promise<void>;
  stop(): void;
  getStream(): MediaStream | null;
  captureFrame(): Promise<ImageBitmap>;
}

Use an HTML <video> element for preview.

Use canvas/ImageBitmap for capture.

Do not repeatedly screenshot the video element at low quality.

────────

7. CAPTURE

Capture the best practical resolution available.

Pipeline:

video
 ↓
capture frame
 ↓
normalize orientation
 ↓
create master bitmap
 ↓
vision analysis
 ↓
effects

Maintain separate:

preview
processing
master
print

Do not repeatedly resize the same bitmap.

────────

8. FACE DETECTION

Because this is a web app, use a browser-compatible vision layer.

Preferred options:

1. MediaPipe Tasks / Face Landmarker
2. ONNX Runtime Web
3. TensorFlow.js if needed
4. Browser-native APIs only where they are sufficient

Do not build the architecture around one vision library.

Create an abstraction:

interface FaceDetector {
  detect(image: ImageBitmap): Promise<FaceModel[]>;
}

This allows the implementation to change later.

────────

9. FACE MODEL

interface FaceModel {
  boundingBox: Rect;

  leftEye?: Point;
  rightEye?: Point;

  nose?: Point;
  mouth?: Point;

  leftEyebrow?: Point;
  rightEyebrow?: Point;

  faceContour: Point[];

  leftPupil?: Point;
  rightPupil?: Point;

  noseContour: Point[];
  outerLips: Point[];
  innerLips: Point[];
}

Normalize coordinates to:

0.0 → 1.0

rather than hard-coding pixel dimensions.

────────

10. MULTI-PERSON SUPPORT

Target:

1–6 people

Every face gets its own effect parameters.

Example:

Person 1 → giant eyes
Person 2 → giant nose
Person 3 → giant forehead
Person 4 → enormous jaw

Do not apply one deformation uniformly to every face.

────────

11. CARICATURE ENGINE

The key visual feature is a localized mesh deformation system.

Do NOT simply crop a face and scale it.

Use:

face landmarks
 ↓
control points
 ↓
deformation field
 ↓
mesh warp
 ↓
render

Use WebGL2 for the first GPU implementation.

Add WebGPU as an optional acceleration path if practical.

The app must have a Canvas 2D fallback for environments where GPU features fail.

────────

12. CARICATURE PARAMETERS

interface CaricatureConfiguration {
  eyeScale: number;
  noseScale: number;
  mouthScale: number;
  foreheadScale: number;
  jawScale: number;
  cheekScale: number;
  earScale: number;
  eyebrowScale: number;
  faceWidth: number;
  faceHeight: number;
  neckScale: number;
  shoulderScale: number;
  bodyScale: number;
  randomness: number;
}

Normal value:

1.0

Example:

eyeScale = 1.35
noseScale = 1.55
foreheadScale = 1.50
jawScale = 1.30

Use safe limits.

Do not allow the mesh to fold over itself.

────────

13. FEATURE DEFORMATION

Eyes

Enlarge or shrink the eye region using smooth falloff around the eye center.

The surrounding skin must transition naturally.

Nose

Control:

• width
• length
• bridge
• tip
• nostrils

Forehead

Use eyebrow position, face contour, and an estimated hairline region to stretch the upper face.

Mouth

Control:

• width
• height
• lip thickness
• smile curvature

Jaw

Control:

• jaw width
• chin size
• cheek width

Ears

Apply controlled outward deformation.

Eyebrows

Scale or exaggerate the existing eyebrows.

────────

14. BODY CARICATURE

Use person segmentation where available.

Optional effects:

• huge head
• tiny head
• tiny shoulders
• giant shoulders
• long neck
• pumpkin body
• cartoon body proportions
• barrel-chest silhouette

For chest/bust exaggeration:

Only deform the visible silhouette already present in the photograph.

Do not synthesize nudity or explicit anatomy.

The effect should read as a cartoon caricature.

────────

15. PRESETS

Implement:

type CaricaturePreset =
  | "Goblin"
  | "Demon"
  | "HotMess"
  | "Witch"
  | "Vampire"
  | "PumpkinHead"
  | "CartoonVillain"
  | "DrunkUncle"
  | "EvilPromQueen"
  | "Random";

Example configurations should live in JSON.

────────

16. GOBLIN PRESET

{
  "eyeScale": 0.85,
  "noseScale": 1.65,
  "mouthScale": 0.90,
  "foreheadScale": 1.25,
  "jawScale": 1.45,
  "earScale": 1.50
}

────────

17. DEMON PRESET

{
  "eyeScale": 1.40,
  "noseScale": 1.30,
  "mouthScale": 1.25,
  "foreheadScale": 1.40,
  "jawScale": 1.50
}

────────

18. HOT MESS PRESET

{
  "eyeScale": 1.25,
  "noseScale": 1.20,
  "mouthScale": 1.40,
  "jawScale": 1.15,
  "cheekScale": 1.35,
  "randomness": 0.35
}

────────

19. WTF MODE

Create an extreme random mode.

Choose 2–5 features and exaggerate them.

Example:

Eyes: 1.55
Nose: 1.75
Mouth: 1.40
Forehead: 1.60
Jaw: 1.50

Never exceed configured safety limits.

────────

20. DETERMINISTIC RANDOMIZATION

Generate a seed per photograph.

const seed = crypto.randomUUID();

Use a seeded PRNG for:

• feature selection
• deformation strength
• ghost position
• ghost distortion
• caption
• frame
• overlays

This allows the result to be reproduced for debugging.

────────

21. GHOST EFFECT

The ghost is generated from the photograph itself.

Pipeline:

captured photo
 ↓
person segmentation
 ↓
extract person
 ↓
duplicate
 ↓
deform
 ↓
blur
 ↓
desaturate
 ↓
increase brightness
 ↓
reduce opacity
 ↓
offset
 ↓
place behind foreground

Recommended:

opacity: 0.20–0.45
blur: moderate
saturation: low
brightness: slightly high
offsetY: -20 to -80 px
offsetX: -30 to +30 px

────────

22. MULTIPLE GHOST ECHOES

Support 2–3 ghosts.

Example:

Ghost 3
   ↓
Ghost 2
   ↓
Ghost 1
   ↓
Real person

Example opacity:

0.12
0.20
0.32

Ghosts should have slightly different offsets and distortions.

────────

23. GHOST POSE

The ghost should not necessarily match the foreground exactly.

Apply subtle transformations:

• head tilt
• elongated body
• mouth distortion
• slight pose displacement
• exaggerated eyes

This creates an actual apparition rather than a transparent duplicate.

────────

24. HALLOWEEN OVERLAYS

Use transparent PNG/WebP/SVG assets for:

• blood splatter
• cobwebs
• spiders
• bats
• skulls
• eyeballs
• horns
• vampire fangs
• graveyard
• moon
• candles
• fog
• cracked glass
• scratches
• film grain
• vignette

Keep effects modular.

────────

25. ADULT HUMOR

The booth should be adult-themed through humor, captions, and ridiculous caricature.

It should NOT generate:

• pornography
• explicit sexual acts
• nudity
• synthetic sexual anatomy
• explicit sexual captions

Suggested captions:

BAD DECISIONS WERE MADE.

YOUR EX IS GOING TO SEE THIS.

YOU LOOK LIKE TROUBLE.

0% DIGNITY.

HAUNTED AND THIRSTY.

THIS SEEMED LIKE A GOOD IDEA.

PLEASE DON'T TAG YOUR EMPLOYER.

POSSESSED BY BAD DECISIONS.

DEMONICALLY ATTRACTIVE.

UNFIT FOR DAYLIGHT.

WE HAVE QUESTIONS.

YOUR MOTHER ASKED US NOT TO PRINT THIS.

THE DEMONS APPROVE.

HOTTER THAN A HAUNTED HOUSE.

QUESTIONABLE AFTER DARK.

The joke should come from absurdity, not explicit sexual content.

────────

26. PROCESSING SCREEN

While processing, display randomized messages:

ANALYZING YOUR FACE...

MEASURING BAD DECISIONS...

CALCULATING DEMONIC PROPORTIONS...

ENLARGING THINGS THAT DIDN'T NEED ENLARGING...

SUMMONING YOUR INNER GOBLIN...

ADDING QUESTIONABLE AMOUNTS OF FOREHEAD...

CONSULTING THE DEMONS...

FINALIZING YOUR POOR LIFE CHOICES...

Never show a blank loading screen.

────────

27. EFFECT PIPELINE

Recommended:

RAW IMAGE
 ↓
orientation normalization
 ↓
face detection
 ↓
landmarks
 ↓
person segmentation
 ↓
foreground caricature
 ↓
ghost generation
 ↓
background
 ↓
Halloween effects
 ↓
caption
 ↓
frame
 ↓
sharpening
 ↓
print output

Keep each stage independently testable.

────────

28. COMPOSITION ENGINE

interface CompositionEngine {
  compose(config: CompositionConfig): Promise<ImageBitmap>;
}

Layer order:

1. Background
2. Fog / atmosphere
3. Ghosts
4. Foreground people
5. Decorative effects
6. Caption
7. Frame
8. Date / booth branding

────────

29. RENDERING

Create:

CanvasRenderer
WebGLRenderer
WebGPURenderer

Use feature detection.

Preferred:

WebGPU
  ↓
WebGL2
  ↓
Canvas 2D fallback

Do not make WebGPU mandatory.

────────

30. WEB WORKERS

Move expensive processing off the UI thread.

Use:

Worker
OffscreenCanvas
ImageBitmap

where supported.

The main React UI must remain responsive.

Recommended architecture:

React UI
   ↓
Processing Worker
   ↓
Vision / Warp / Composition
   ↓
ImageBitmap
   ↓
React Result Screen

────────

31. PERFORMANCE TARGETS

Target:

camera preview: 30 FPS+
capture: <1 sec
face detection: <1 sec where practical
caricature: <3 sec
ghost: <2 sec
total processing: <5 sec

These are targets, not guarantees.

Do not freeze the main thread.

────────

32. UI

Design for someone standing several feet away.

Use:

• huge buttons
• high contrast
• minimal text
• full-screen layout
• no keyboard
• no browser chrome in standalone mode

Example:

┌────────────────────────────────────┐
│                                    │
│          LIVE CAMERA               │
│                                    │
│           [ PEOPLE ]               │
│                                    │
│                                    │
│     [ GHOST ] [ CARICATURE ]       │
│                                    │
│             [ BOO ]                │
│                                    │
└────────────────────────────────────┘

────────

33. ATTRACT MODE

Rotate:

WELCOME TO THE HAUNTED BOOTH

GET YOUR FACE RUINED

MAKE A TERRIBLE DECISION

TAKE A PHOTO

BECOME A GHOST

YOUR FACE WILL NEVER BE THE SAME

Use subtle animation.

Automatically return to attract mode after a configurable idle timeout.

────────

34. AUTO-DETECTION

Optional unattended mode:

detect ≥ 1 face
 ↓
stable for ~2 seconds
 ↓
READY?
 ↓
3
2
1
BOO!
 ↓
capture

Operator should be able to disable auto-detection.

────────

35. COUNTDOWN

Show enormous numbers:

3
2
1
BOO!

Use:

• heartbeat sound
• camera shutter
• optional flash animation

────────

36. RESULT SCREEN

┌────────────────────────────────────┐
│                                    │
│          FINAL PHOTO               │
│                                    │
│        [ PROCESSED IMAGE ]         │
│                                    │
│      [ PRINT ]  [ RETAKE ]         │
│                                    │
└────────────────────────────────────┘

If auto-print is enabled, automatically begin printing.

────────

37. PRINTING ARCHITECTURE

This is the most hardware-dependent part of the project.

Create:

interface PhotoPrinter {
  name: string;
  discover(): Promise<PrinterDevice[]>;
  connect(device: PrinterDevice): Promise<void>;
  print(image: Blob | ImageBitmap): Promise<void>;
  cancel(): Promise<void>;
  disconnect(): Promise<void>;
}

Create:

PrinterManager
PrinterAdapter
BrowserPrintAdapter
AirPrintAdapter
VendorPrinterAdapter

The exact printer model MUST be supplied before implementing the final adapter.

────────

38. IMPORTANT PRINTING RULE

Do not assume that Safari can directly send arbitrary JPEG data to a Bluetooth photo printer.

Depending on the printer, use one of:

A. Browser/system print dialog

B. AirPrint-compatible workflow

C. Printer vendor web/API/SDK bridge

D. Local print bridge running on another device

E. Supported Web Bluetooth/WebUSB only when confirmed for the exact device/browser

The application architecture must isolate this uncertainty.

────────

39. PRINT FAILURE

If printing fails:

THE PRINTER HAS BEEN POSSESSED.

Buttons:

TRY AGAIN
SAVE PHOTO
CONTINUE WITHOUT PRINTING

Never discard the finished image merely because printing failed.

────────

40. PRINT OUTPUT

Generate a printer-specific output.

For example:

master image
    ↓
crop/fit to paper
    ↓
printer resolution
    ↓
JPEG/PNG
    ↓
printer adapter

Do not repeatedly resize the master image.

────────

41. 4×6 PHOTO LAYOUT

Make 4×6 a first-class output preset.

Aspect ratio:

2:3

Create:

PrintLayout

supporting:

• 4×6
• square
• 2×6 strip
• future sizes

────────

42. OPTIONAL PHOTO STRIP

Add an optional 2×6 Halloween strip mode.

Pipeline:

capture 1
capture 2
capture 3
capture 4
 ↓
vertical strip
 ↓
print

This is a future feature unless specifically requested.

────────

43. STORAGE

Use IndexedDB for temporary local data.

Store:

• settings
• printer configuration
• effect presets
• temporary processed images

Do not store unnecessary biometric metadata.

Default behavior:

delete photos after session / configurable timeout

────────

44. PRIVACY

Default:

local processing
no cloud upload
no facial identity database
no biometric profile

Face landmarks should be discarded after processing unless explicitly required.

If a future cloud AI feature is added, make it opt-in and clearly disclose it.

────────

45. PWA

Create:

manifest.webmanifest
service worker
offline cache
icons

The app should be installable to the iPad Home Screen.

Use standalone display mode where supported.

Cache all core application assets.

The core booth must continue working after the initial installation without network access.

────────

46. ORIENTATION

The booth should be optimized for one physical orientation.

If the booth is mounted landscape:

lock design to landscape

Do not rely solely on CSS orientation.

Test on the actual iPad.

────────

47. OPERATOR MODE

Create a hidden settings panel.

Access by:

press and hold the booth logo for 5 seconds

or a configurable gesture.

Settings:

Camera
Countdown
Auto Start
Caricature Strength
Ghost Strength
Preset
Frame
Caption Mode
Printer
Auto Print
Copies
Sound Volume
Photo Retention
Attract Mode
Debug Mode

────────

48. OPERATOR TOOLS

Include:

TEST CAMERA

TEST CAPTURE

TEST EFFECT

TEST PRINTER

DISCOVER PRINTER

CLEAR PRINT QUEUE

CLEAR TEMP PHOTOS

RESET SETTINGS

SHOW PERFORMANCE

SHOW CAMERA RESOLUTION

────────

49. ERROR HANDLING

Never crash because:

• camera permission fails
• face detection fails
• segmentation fails
• WebGL fails
• WebGPU fails
• printer disappears
• printing fails
• processing times out
• browser API is unsupported

Provide graceful fallback.

For example:

No face detected
→ use normal Halloween photo

rather than:

ERROR

────────

50. AUDIO

Use short local audio files.

Examples:

heartbeat
camera shutter
ghost whisper
evil laugh
boo
printer sound
dramatic sting

Because browsers restrict autoplay, initialize audio after the operator/guest’s first interaction.

Provide volume controls.

────────

51. OPTIONAL AI BACKGROUND FEATURE

Do NOT make generative AI part of the initial core pipeline.

A future AI background feature may:

1. Segment the real people.
2. Preserve them.
3. Generate/choose a Halloween background.
4. Composite the real people into the background.

Possible backgrounds:

• haunted mansion
• cemetery
• vampire castle
• cursed carnival
• abandoned motel
• witch’s kitchen
• ridiculous haunted nightclub

Do not send the person’s photograph to a cloud AI provider unless the operator explicitly enables that feature.

────────

52. WHY THE CORE EFFECT SHOULD NOT BE GENERATIVE AI

The booth needs:

• speed
• predictable faces
• reliable output
• offline operation
• privacy
• consistent printing

Therefore use:

Face landmarks
+
Person segmentation
+
Mesh deformation
+
WebGL/WebGPU
+
Canvas composition

rather than generating an entirely new image.

Generative AI can be a later enhancement.

────────

53. TESTING

Unit test:

• state transitions
• seeded randomization
• effect parameter generation
• coordinate normalization
• ghost parameters
• print queue
• error recovery
• image layout

Integration test:

• camera
• processing worker
• composition
• printer adapter

Test on the actual iPad.

Do not rely exclusively on desktop Chrome or Safari.

────────

54. DEVELOPMENT PHASES

Phase 1 — Shell

Build:

• React app
• full-screen layout
• state machine
• attract screen
• operator panel

No image effects.

Phase 2 — Camera

Build:

• getUserMedia
• live preview
• capture
• orientation handling
• permission flow

Phase 3 — Vision

Build:

• face detector abstraction
• landmarks
• multiple faces
• debug landmark overlay

Phase 4 — Caricature

Implement one deformation first:

nose enlargement

Then:

• eyes
• mouth
• forehead
• jaw
• cheeks
• ears

Phase 5 — GPU

Implement WebGL2 mesh warp.

Add WebGPU only if useful.

Phase 6 — Segmentation

Implement person segmentation.

Phase 7 — Ghost

Implement:

• single ghost
• multiple ghosts
• distortion
• opacity
• blur
• offsets

Phase 8 — Composition

Implement:

• backgrounds
• frames
• captions
• Halloween overlays
• atmosphere

Phase 9 — Printing

Implement mock printer first.

Then implement the exact printer adapter after the hardware model is supplied.

Phase 10 — Booth Mode

Implement the complete unattended flow.

────────

55. CLAUDE WORKFLOW RULES

Before changing architecture:

Inspect the existing code.

Before implementing a subsystem:

Explain:

1. files that will change
2. architecture
3. dependencies
4. testing approach

Then implement.

Do not rewrite the entire project for a localized bug.

Do not introduce a dependency when browser APIs or existing project code are sufficient.

Do not put business logic in React components.

Do not put rendering logic in React components.

Do not block the main thread.

────────

56. DEFINITION OF DONE

The finished web app allows someone to:

1. Walk up to the booth.
2. See themselves in the iPad camera.
3. Start automatically or press BOO.
4. See a countdown.
5. Take a photograph.
6. Detect one or more faces.
7. Exaggerate facial features.
8. Create a ghost behind the subjects.
9. Add Halloween effects.
10. Add a funny adult-party caption.
11. Display the finished photo.
12. Send it through the configured printer workflow.
13. Recover gracefully if printing fails.
14. Return automatically to attract mode.
15. Allow the next group to use the booth.

The application should feel like a physical Halloween attraction, not a generic web form.

────────

57. FIRST CLAUDE TASK

Do NOT build the entire application in one pass.

Start by:

1. Creating the Vite + React + TypeScript project.
2. Creating the directory structure.
3. Implementing the booth state machine.
4. Implementing the full-screen attract screen.
5. Implementing the operator panel.
6. Implementing camera permission handling and the live front-camera preview.
7. Creating interfaces/stubs for vision, effects, rendering, storage and printing.
8. Adding tests for the state machine.
9. Running the application.
10. Reporting exactly what works and what remains.

Do not implement the caricature engine or printer integration until the camera pipeline is working.

────────

58. SECOND CLAUDE TASK

After Phase 1 works, implement:

camera capture
→ ImageBitmap
→ worker
→ face detection
→ landmark visualization

Create a development-only debug mode that draws:

• face bounding boxes
• eye landmarks
• nose
• mouth
• face contour

This is required before building the deformation engine.

────────

59. THIRD CLAUDE TASK

Build the caricature engine incrementally.

Start with:

nose enlargement

Then add:

eye enlargement
mouth enlargement
forehead enlargement
jaw enlargement
ear enlargement

Every deformation must have:

• configurable strength
• smooth falloff
• safe limits
• unit tests where practical

Do not proceed to full random presets until individual deformations look correct.

────────

60. FOURTH CLAUDE TASK

Build the ghost engine.

Required result:

real person
+
distorted translucent duplicate
+
offset
+
blur
+
desaturation
=
convincing ghost

Then add multiple echoes.

────────

61. FIFTH CLAUDE TASK

Build the final composition pipeline:

background
→ ghost
→ caricatured people
→ atmosphere
→ overlays
→ caption
→ frame

Output a high-quality 4×6-ready image.

────────

62. SIXTH CLAUDE TASK

Implement printer abstraction and a mock printer.

Do NOT implement a vendor-specific printer until the exact printer model is known.

The mock printer should allow the complete booth workflow to be tested without hardware.

────────

63. FINAL PRODUCT PERSONALITY

The visual personality should be:

• dark Halloween
• theatrical
• irreverent
• adult party
• absurd
• cartoonish
• slightly trashy
• funny

The app should feel like:

> “Someone built a haunted photo booth after drinking three energy drinks and making several questionable decisions.”

But it should remain technically reliable.

────────

64. FINAL PRIORITY ORDER

When tradeoffs occur, prioritize:

1. Booth reliability
2. Camera reliability
3. Fast processing
4. Good faces
5. Funny effects
6. Reliable printing
7. Visual polish
8. Advanced AI features

A booth that looks amazing but takes 20 seconds per photo is worse than a booth that produces a funny print in five seconds.