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
 * existed. The operator explicitly confirmed a single tap per photo is
 * acceptable, so this adapter uses the Web Share API (`navigator.share`)
 * to open the native iOS share sheet with the finished photo already
 * attached -- the operator picks the printer's own app from that sheet
 * and finishes the print there. Zero Bluetooth code, zero extra hardware.
 *
 * This same mechanism doubles as a way for a guest to get the photo onto
 * their own phone (AirDrop, Messages, Save to Photos) without any
 * QR-code/cloud-upload feature -- though that only covers Apple-to-Apple
 * handoff (AirDrop), unlike a QR code, which was intentionally deferred.
 */
export class ShareSheetPrinterAdapter implements PhotoPrinter {
  name = "Share Sheet (print via printer's own app)";

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
        text: "Pick a printer app (e.g. Kodak Photo Printer) to print this photo, or share it to a phone.",
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
