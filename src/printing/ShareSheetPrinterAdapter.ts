import type { PhotoPrinter, PrinterDevice } from "./PrinterAdapter";
import { imageBitmapToBlob } from "../utils/image";

/**
 * Hands the finished photo off through the iOS/iPadOS native share sheet
 * instead of printing directly (CLAUDE.md sections 37-39, option A: "no
 * assumption that Safari can directly send arbitrary JPEG data to a
 * Bluetooth photo printer").
 *
 * Why this exists rather than a direct Bluetooth vendor adapter for the
 * target printer (Kodak Mini 2 Retro): Safari on iOS/iPadOS has no Web
 * Bluetooth API at all -- not partial support, none, with no roadmap from
 * WebKit -- so no web page can talk to any Bluetooth device from this
 * browser, regardless of the printer's protocol. The Kodak Mini 2 Retro
 * also has no published SDK or documented protocol of its own (only its
 * own "Kodak Photo Printer" app talks to it), so there's nothing to
 * reverse-engineer into a VendorPrinterAdapter here even if Web Bluetooth
 * existed.
 *
 * **Confirmed on the real device (see PROJECT_LOG.md)**: the Kodak Photo
 * Printer app is NOT a registered iOS share extension, so it never
 * appears as a row in the share sheet no matter what's shared to it, and
 * it isn't AirPrint-compatible either -- there is no web mechanism, this
 * one included, that can hand a photo to it directly. Two paths work from
 * this same share sheet:
 *   1. The plain built-in "Save Image" action -- saves to the general
 *      camera roll, operator then opens the Kodak app and finds it
 *      themselves. Always available, zero setup.
 *   2. A **custom Shortcut named "Print to Kodak"** the operator builds
 *      once in the Shortcuts app (see PROJECT_LOG.md's "Print to Kodak
 *      Shortcut setup" for the exact steps) with "Show in Share Sheet"
 *      turned on: it saves straight into a specific Photos album (e.g.
 *      "Halloween 2026") *and* opens the Kodak app automatically, so it
 *      appears as its own tappable icon right alongside "Save Image" in
 *      this same sheet -- one tap gets both the right album and the app
 *      switch, instead of two separate manual steps.
 * Either way this is a real app hand-off, not a one-tap print -- the
 * share-sheet text and the result screen's copy are written to make that
 * expectation clear rather than implying the print itself finished.
 *
 * This same mechanism doubles as a way for a guest to get the photo onto
 * their own phone (AirDrop, Messages, Save to Photos) without any
 * QR-code/cloud-upload feature -- though that only covers Apple-to-Apple
 * handoff (AirDrop), unlike a QR code, which was intentionally deferred.
 */
export class ShareSheetPrinterAdapter implements PhotoPrinter {
  name = "Share Sheet (Save Image, then print from the Kodak app)";

  async discover(): Promise<PrinterDevice[]> {
    // There's no discoverable "device" here -- the share sheet lists
    // whatever the OS already offers (installed apps, AirDrop, etc.).
    return [{ id: "share-sheet", name: "iOS Share Sheet", kind: "vendorBridge" }];
  }

  async connect(_device: PrinterDevice): Promise<void> {
    // No persistent connection -- the share sheet is invoked fresh per print.
  }

  /**
   * Opens the share sheet with the photo attached. Resolves normally both
   * when the operator completes a share AND when they simply back out of
   * the sheet (CLAUDE.md section 49: a cancelled share isn't a printer
   * failure, so it shouldn't trigger the "PRINTER HAS BEEN POSSESSED"
   * failure screen). Only throws for a genuine capability problem (the
   * browser/device can't share files at all) or an unexpected share error.
   */
  async print(image: Blob | ImageBitmap): Promise<void> {
    const blob = image instanceof Blob ? image : await imageBitmapToBlob(image);
    const file = new File([blob], `ghost-booth-${Date.now()}.jpg`, { type: "image/jpeg" });

    if (!navigator.canShare || !navigator.canShare({ files: [file] })) {
      throw new Error(
        "This browser/device can't share image files. Update iOS/iPadOS, or switch to a " +
          "different printer option in the operator panel.",
      );
    }

    try {
      await navigator.share({
        files: [file],
        title: "Ghost Booth Photo",
        text: 'Tap "Print to Kodak" if set up, or Save Image and open the Kodak Photo Printer app yourself -- Kodak\'s app can\'t be picked directly from this sheet.',
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // The operator/guest backed out of the share sheet -- treat as a
        // no-op, not a print failure.
        return;
      }
      throw err;
    }
  }

  async cancel(): Promise<void> {
    // Nothing to cancel: the share sheet is a synchronous OS-level modal,
    // not a queued/in-flight job we could reach into.
  }

  async disconnect(): Promise<void> {}
}
