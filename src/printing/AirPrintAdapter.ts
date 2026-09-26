import type { PhotoPrinter, PrinterDevice } from "./PrinterAdapter";
import { BrowserPrintAdapter } from "./BrowserPrintAdapter";

/**
 * AirPrint-compatible workflow (CLAUDE.md section 38, option B). On iPad
 * Safari there is no direct AirPrint API for web apps; in practice this
 * means routing through the system print dialog, which will list any
 * AirPrint printer the iPad already sees on the network. This adapter
 * exists as its own named class so operator UI can distinguish "AirPrint
 * printer, reached via the system dialog" from a generic browser print,
 * even though the underlying call is currently identical.
 */
export class AirPrintAdapter implements PhotoPrinter {
  name = "AirPrint";
  private delegate = new BrowserPrintAdapter();

  async discover(): Promise<PrinterDevice[]> {
    const devices = await this.delegate.discover();
    return devices.map((d) => ({ ...d, kind: "airPrint" as const }));
  }

  connect(device: PrinterDevice): Promise<void> {
    return this.delegate.connect(device);
  }

  print(image: Blob | ImageBitmap): Promise<void> {
    return this.delegate.print(image);
  }

  cancel(): Promise<void> {
    return this.delegate.cancel();
  }

  disconnect(): Promise<void> {
    return this.delegate.disconnect();
  }
}
