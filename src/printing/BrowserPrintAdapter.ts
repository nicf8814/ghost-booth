import type { PhotoPrinter, PrinterDevice } from "./PrinterAdapter";

/**
 * Uses the browser/system print dialog (CLAUDE.md section 38, option A).
 * The most portable option: works anywhere a printer is already set up
 * as a system printer (e.g. AirPrint-registered), at the cost of a manual
 * "Print" tap in the dialog rather than a fully unattended print.
 */
export class BrowserPrintAdapter implements PhotoPrinter {
  name = "Browser Print Dialog";
  private printWindow: Window | null = null;

  async discover(): Promise<PrinterDevice[]> {
    // The browser print dialog doesn't expose device discovery; it always
    // "sees" whatever printers the OS has configured.
    return [{ id: "system-print-dialog", name: "System Print Dialog", kind: "browserPrint" }];
  }

  async connect(_device: PrinterDevice): Promise<void> {
    // No persistent connection needed.
  }

  async print(image: Blob | ImageBitmap): Promise<void> {
    const blob = image instanceof Blob ? image : await imageBitmapToBlob(image);
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (!win) {
      URL.revokeObjectURL(url);
      throw new Error("Could not open print window (popup blocked?)");
    }
    this.printWindow = win;
    win.onload = () => {
      win.print();
      URL.revokeObjectURL(url);
    };
  }

  async cancel(): Promise<void> {
    this.printWindow?.close();
    this.printWindow = null;
  }

  async disconnect(): Promise<void> {
    this.printWindow = null;
  }
}

async function imageBitmapToBlob(bitmap: ImageBitmap): Promise<Blob> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  ctx?.drawImage(bitmap, 0, 0);
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
}
