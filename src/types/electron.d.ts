// Typen für die in public/preload.js via contextBridge bereitgestellte API.
// Bisher wurde window.electronAPI nur über (window as any) bzw.
// 'electronAPI' in window genutzt — diese Deklaration macht die Nutzung
// typsicher.

export interface UpdateInfo {
  version?: string;
}

export interface UpdateProgress {
  percent?: number;
}

export interface UpdateError {
  message?: string;
}

export interface ImageUsage {
  /** Dateien in der Bildablage (Bilder und Vorschaubilder) und ihr Platz in Bytes. */
  files: number;
  bytes: number;
  /** Dateien, die zu keinem Eintrag mehr gehören. */
  orphanFiles: number;
  orphanBytes: number;
  /** Keine Einträge geladen – dann wird nicht aufgeräumt. */
  blocked: boolean;
  /** Größe der Sicherungskopie von vor der Bildauslagerung; null, wenn es keine gibt. */
  legacyBackupBytes: number | null;
}

export interface ImageCleanupResult {
  blocked: boolean;
  /** In den Papierkorb gelegte Dateien und ihr Platz in Bytes. */
  removed: number;
  bytes: number;
  /** Dateien, die sich nicht in den Papierkorb legen ließen (bleiben liegen). */
  failed: number;
}

export interface LogInfo {
  /** Größe des Protokolls in Bytes; 0, solange nichts eingetragen wurde. */
  bytes: number;
  /** Zeitpunkt des letzten Eintrags (ISO) oder null. */
  updatedAt: string | null;
  exists: boolean;
}

/** Eine von der Texterkennung gelesene Zeile; Koordinaten 0…1 der Karte, Ursprung oben links. */
export interface OcrLine {
  text: string;
  confidence: number;
  /** „full“: ganze Karte; „bottom“: vergrößerter unterer Rand (Set-Code, Nummer). */
  pass: 'full' | 'bottom';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrResult {
  width: number;
  height: number;
  /** Karte im Foto gefunden und entzerrt; sonst wurde das ganze Bild gelesen. */
  cardDetected: boolean;
  lines: OcrLine[];
  /** Die gelesene (entzerrte) Karte als JPEG-Data-URL; null, wenn keine erzeugt wurde. */
  preview?: string | null;
}

export interface ElectronAPI {
  // Persistenter Speicher (electron-store); nur die Schlüssel aus STORAGE_KEYS,
  // alles andere lehnt der Hauptprozess mit einem Fehler ab.
  storeGet: (key: string) => Promise<unknown>;
  storeSet: (key: string, data: unknown) => Promise<boolean>;

  // Externe Adresse im Standardbrowser öffnen; false, wenn sie nicht mit
  // https:// beginnt.
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

  // Bilder (#120): Ablage als Datei, Rückgabe ist ein Verweis (cdx-image://…).
  saveImage: (dataUrl: string) => Promise<string | null>;
  readImage: (ref: string) => Promise<string | null>;
  // Vorschaubild (#128) zu einem abgelegten Bild; fehlt in älteren App-Versionen.
  saveThumbnail?: (ref: string, dataUrl: string) => Promise<string | null>;

  // Bildablage aufräumen (#143); fehlt in älteren App-Versionen.
  getImageUsage?: () => Promise<ImageUsage>;
  cleanupImages?: () => Promise<ImageCleanupResult>;
  trashLegacyBackup?: () => Promise<boolean>;

  // Fehlerprotokoll (#136); fehlt in älteren App-Versionen.
  logError?: (entry: { level: 'error' | 'warn'; message: string }) => void;
  getLogInfo?: () => Promise<LogInfo>;
  openLog?: () => Promise<boolean>;
  exportLog?: () => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;

  // Kartenscanner (#168), nur macOS; fehlt in älteren App-Versionen.
  isScannerAvailable?: () => Promise<boolean>;
  recognizeCard?: (dataUrl: string) => Promise<OcrResult>;
  /** Startet die Texterkennung vorab (macOS lädt das Modell beim ersten Mal lange). */
  warmUpScanner?: () => Promise<boolean>;

  // Auto-Backup (#91)
  chooseBackupFolder: () => Promise<string | null>;
  writeBackup: (payload: {
    folder: string;
    json: string;
    keep: number;
  }) => Promise<{ ok: boolean; path?: string; error?: string }>;
  openBackupFolder: (folder: string) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
