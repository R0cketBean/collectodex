// Auto-Backup-Trigger (#91): Schreibt beim Start — sofern aktiviert und heute
// noch nicht geschehen — eine vollständige JSON-Sicherung in den gewählten
// Ordner. Das Schreiben/Aufräumen übernimmt der Main-Prozess (IPC 'backup:*');
// hier wird nur die versionierte Hülle gebaut und der Lauf gesteuert.

import { useEffect, useRef } from 'react';
import type { Category, CollectionItem } from '../types/models';
import { wrapBackup } from '../utils/backup';
import {
  loadBackupSettings,
  saveBackupSettings,
  shouldRunBackup,
  todayKey,
} from '../utils/backupSettings';
import { logger } from '../utils/logger';

interface UseAutoBackupArgs {
  categories: Category[];
  items: CollectionItem[];
  isInitialized: boolean;
}

export const useAutoBackup = ({
  categories,
  items,
  isInitialized,
}: UseAutoBackupArgs): void => {
  // Pro App-Lauf höchstens einmal anstoßen (auch gegen StrictMode-Doppelmount).
  const ranRef = useRef(false);

  useEffect(() => {
    if (!isInitialized || ranRef.current) {
      return;
    }
    const api = window.electronAPI;
    // Nur in der installierten App (Dateisystemzugriff über IPC).
    if (!api || typeof api.writeBackup !== 'function') {
      return;
    }
    ranRef.current = true;

    const run = async () => {
      try {
        const settings = await loadBackupSettings();
        const hasData = categories.length > 0 || items.length > 0;
        const today = todayKey();
        if (!shouldRunBackup(settings, today, hasData) || !settings.folder) {
          return;
        }

        const json = JSON.stringify(wrapBackup({ categories, items }), null, 2);
        const result = await api.writeBackup({
          folder: settings.folder,
          json,
          keep: settings.keep,
        });

        if (result?.ok) {
          await saveBackupSettings({ ...settings, lastBackup: today });
          logger.debug('[AutoBackup] Backup geschrieben:', result.path);
        } else {
          logger.debug('[AutoBackup] Backup fehlgeschlagen:', result?.error);
        }
      } catch (error) {
        logger.debug('[AutoBackup] Unerwarteter Fehler:', error);
      }
    };

    run();
    // Bewusst nur an isInitialized gebunden: einmaliger Start-Lauf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized]);
};
