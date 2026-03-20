export {};

declare global {
  interface Window {
    electronAPI?: {
      saveSTL: (
        buffer: ArrayBuffer,
      ) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      isElectron: boolean;
    };
  }
}
