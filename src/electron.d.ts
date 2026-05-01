export {};

declare global {
  interface Window {
    electronAPI?: {
      saveSTL: (
        buffer: ArrayBuffer,
        filename?: string,
      ) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      isElectron: boolean;
    };
  }
}
