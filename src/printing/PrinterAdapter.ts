// CLAUDE.md sections 37-38: printer support must be abstracted since the
// exact hardware/browser combination determines which workflow is possible.

export interface PrinterDevice {
  id: string;
  name: string;
  kind: "browserPrint" | "airPrint" | "vendorBridge" | "mock";
}

export interface PhotoPrinter {
  name: string;
  discover(): Promise<PrinterDevice[]>;
  connect(device: PrinterDevice): Promise<void>;
  print(image: Blob | ImageBitmap): Promise<void>;
  cancel(): Promise<void>;
  disconnect(): Promise<void>;
}

/** Common shape every concrete adapter (Browser/AirPrint/Vendor/Mock) implements. */
export type PrinterAdapter = PhotoPrinter;
