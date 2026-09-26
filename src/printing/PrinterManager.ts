import type { PhotoPrinter, PrinterDevice } from "./PrinterAdapter";
import { MockPrinterAdapter } from "./MockPrinterAdapter";

/**
 * Owns the currently-selected printer adapter and exposes a
 * hardware-agnostic API to the rest of the app (result/printing screens,
 * operator panel). Defaults to the mock adapter so the full booth flow is
 * testable before any real printer is configured.
 */
export class PrinterManager {
  private adapter: PhotoPrinter;

  constructor(adapter: PhotoPrinter = new MockPrinterAdapter()) {
    this.adapter = adapter;
  }

  setAdapter(adapter: PhotoPrinter): void {
    this.adapter = adapter;
  }

  getAdapter(): PhotoPrinter {
    return this.adapter;
  }

  discover(): Promise<PrinterDevice[]> {
    return this.adapter.discover();
  }

  connect(device: PrinterDevice): Promise<void> {
    return this.adapter.connect(device);
  }

  async print(image: Blob | ImageBitmap, copies = 1): Promise<void> {
    for (let i = 0; i < copies; i++) {
      await this.adapter.print(image);
    }
  }

  cancel(): Promise<void> {
    return this.adapter.cancel();
  }
}
