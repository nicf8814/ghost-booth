import type { PhotoPrinter, PrinterDevice } from "./PrinterAdapter";

/**
 * Placeholder for a printer-vendor-specific bridge (CLAUDE.md section 38,
 * options C/D/E — vendor SDK, local print bridge, or Web
 * Bluetooth/WebUSB). CLAUDE.md is explicit: "The exact printer model MUST
 * be supplied before implementing the final adapter" (section 37) and
 * "Do NOT implement a vendor-specific printer until the exact printer
 * model is known" (section 62). This class intentionally throws so it's
 * impossible to silently ship a no-op vendor integration.
 */
export class VendorPrinterAdapter implements PhotoPrinter {
  name = "Vendor Printer (not configured)";

  async discover(): Promise<PrinterDevice[]> {
    throw new Error(
      "VendorPrinterAdapter has no printer model configured yet. " +
        "Supply the exact printer make/model to implement this adapter.",
    );
  }

  async connect(_device: PrinterDevice): Promise<void> {
    throw new Error("VendorPrinterAdapter is not implemented for any printer yet.");
  }

  async print(_image: Blob | ImageBitmap): Promise<void> {
    throw new Error("VendorPrinterAdapter is not implemented for any printer yet.");
  }

  async cancel(): Promise<void> {}

  async disconnect(): Promise<void> {}
}
