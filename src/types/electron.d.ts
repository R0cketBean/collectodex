// Typen für die in public/preload.js via contextBridge bereitgestellte API.
// Bisher wurde window.electronAPI nur über (window as any) bzw.
// 'electronAPI' in window genutzt — diese Deklaration macht die Nutzung
// typsicher (kein Typecheck in der CI, aber Editor-Unterstützung).

export interface UpdateInfo {
  version?: string;
}

export interface UpdateProgress {
  percent?: number;
}

export interface UpdateError {
  message?: string;
}

export interface ElectronAPI {
  // Persistenter Speicher (electron-store)
  storeGet: (key: string) => Promise<unknown>;
  storeSet: (key: string, data: unknown) => Promise<boolean>;
  storeDelete: (key: string) => Promise<boolean>;
  storeClear: () => Promise<boolean>;

  // Externe URLs im Standardbrowser öffnen
  openExternalURL: (url: string) => Promise<boolean>;

  // Auto-Update (#20). Die on*-Methoden liefern eine Cleanup-Funktion zurück.
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateProgress: (callback: (info: UpdateProgress) => void) => () => void;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateError: (callback: (info: UpdateError) => void) => () => void;
  onUpdateNone: (callback: (info: UpdateInfo) => void) => () => void;
  downloadUpdate: () => Promise<boolean>;
  installUpdate: () => Promise<boolean>;
  // Manuelle Prüfung; { supported: false } im Dev-/ungepackten Modus.
  checkForUpdates: () => Promise<{ supported: boolean }>;
  getAppVersion: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
