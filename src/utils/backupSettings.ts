// Einstellungen für automatische Backups (#91).
//
// Persistiert über den StorageService (electron-store in der App, localStorage
// im Browser/Dev). Das eigentliche Schreiben ins Dateisystem macht der
// Main-Prozess (s. public/electron.js, IPC 'backup:*').

import * as StorageService from '../services/StorageService';

export interface BackupSettings {
  /** Ob automatische Backups beim Start laufen. */
  enabled: boolean;
  /** Zielordner (vom Nutzer gewählt) oder null. */
  folder: string | null;
  /** Wie viele Backups behalten werden. */
  keep: number;
  /** Datum des letzten automatischen Backups (YYYY-MM-DD), falls vorhanden. */
  lastBackup?: string;
}

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  enabled: false,
  folder: null,
  keep: 5,
};

/** Lokales Datum als YYYY-MM-DD (für den 1×-pro-Tag-Vergleich). */
export const todayKey = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

/**
 * Reine, testbare Entscheidung, ob jetzt ein automatisches Backup laufen soll.
 * Läuft nur, wenn aktiviert, ein Ordner gesetzt ist, heute noch nicht gesichert
 * wurde und überhaupt Daten vorhanden sind.
 */
export const shouldRunBackup = (
  settings: BackupSettings,
  today: string,
  hasData: boolean
): boolean =>
  Boolean(
    settings.enabled &&
      settings.folder &&
      hasData &&
      settings.lastBackup !== today
  );

export const loadBackupSettings = async (): Promise<BackupSettings> => {
  const stored = await StorageService.getData<Partial<BackupSettings>>(
    StorageService.STORAGE_KEYS.BACKUP_SETTINGS
  );
  return { ...DEFAULT_BACKUP_SETTINGS, ...(stored || {}) };
};

export const saveBackupSettings = async (
  settings: BackupSettings
): Promise<void> => {
  await StorageService.setData(
    StorageService.STORAGE_KEYS.BACKUP_SETTINGS,
    settings
  );
};
