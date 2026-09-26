import type { PhotoPrinter, PrinterDevice } from "./PrinterAdapter";

/**
 * Mock printer (CLAUDE.md section 62): lets the complete booth workflow —
 * including print failure/retry — be tested without any hardware.
 */
export class MockPrinterAdapter implements PhotoPrinter {
  name = "Mock Printer";
  connected = false;
  private options: { failRate?: number; delayMs?: number };

  constructor(options: { failRate?: number; delayMs?: number } = {}) {
    this.options = options;
  }

  async discover(): Promise<PrinterDevice[]> {
    return [{ id: "mock-printer-1", name: "Mock Printer", kind: "mock" }];
  }

  async connect(_device: PrinterDevice): Promise<void> {
    this.connected = true;
  }

  async print(_image: Blob | ImageBitmap): Promise<void> {
    await delay(this.options.delayMs ?? 800);
    if (Math.random() < (this.options.failRate ?? 0)) {
      throw new Error("Mock printer simulated failure");
    }
  }

  async cancel(): Promise<void> {}

  async disconnect(): Promise<void> {
    this.connected = false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
