import React, { useCallback, useEffect, useState } from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { secondaryButtonClass, secondaryButtonSmallClass } from '../../utils/formStyles';
import { formatBytes, formatInteger } from '../../utils/format';
import { useFeedback } from '../../context/FeedbackContext';
import type { ImageUsage } from '../../types/electron';

// Einstellungen: Bildablage aufräumen (#143). Gezählt und aufgeräumt wird im
// Hauptprozess (public/imageStore.js); von selbst löscht die App nie etwas.

const files = (n: number) => `${formatInteger(n)} ${n === 1 ? 'Datei' : 'Dateien'}`;

/** Zeile zur Belegung, z. B. „501 Dateien, 67,2 MB.“ */
export const describeUsage = (usage: ImageUsage): string =>
  usage.files === 0 ? 'Noch keine Bilder abgelegt.' : `${files(usage.files)}, ${formatBytes(usage.bytes)}.`;

/** Zeile zu den Dateien ohne Eintrag. */
export const describeOrphans = (usage: ImageUsage): string => {
  if (usage.blocked) {
    return 'Es sind keine Einträge geladen. Solange die Sammlung leer ist, wird nichts aufgeräumt.';
  }
  if (usage.files === 0) return '';
  if (usage.orphanFiles === 0) return 'Alle Dateien gehören zu einem Eintrag.';
  const verb = usage.orphanFiles === 1 ? 'gehört' : 'gehören';
  return `${files(usage.orphanFiles)} (${formatBytes(usage.orphanBytes)}) ${verb} zu keinem Eintrag mehr.`;
};

const ImageStorageSection: React.FC = () => {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const supported = !!api?.getImageUsage;
  const { notify, confirm } = useFeedback();
  const [usage, setUsage] = useState<ImageUsage | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await window.electronAPI?.getImageUsage?.();
      if (next) setUsage(next);
    } catch {
      // Ohne Zahlen bleibt der Abschnitt bei der Beschreibung.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCleanup = async () => {
    if (!usage || usage.blocked || usage.orphanFiles === 0) return;
    const ok = await confirm({
      title: `${files(usage.orphanFiles)} in den Papierkorb legen?`,
      message: `Das gibt ${formatBytes(usage.orphanBytes)} frei. Die Dateien gehören zu keinem Eintrag mehr und lassen sich aus dem Papierkorb zurückholen.`,
      confirmLabel: 'Aufräumen',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await api?.cleanupImages?.();
      if (!result || result.blocked) {
        notify('Es wurde nichts aufgeräumt, weil keine Einträge geladen sind.', { kind: 'info' });
      } else if (result.failed > 0) {
        notify(
          `${files(result.removed)} in den Papierkorb gelegt, ${files(result.failed)} ließen sich nicht verschieben und bleiben liegen.`,
          { kind: 'error' }
        );
      } else {
        notify(`${files(result.removed)} in den Papierkorb gelegt (${formatBytes(result.bytes)}).`, { kind: 'success' });
      }
    } catch {
      notify('Aufräumen fehlgeschlagen. Es wurde nichts gelöscht.', { kind: 'error' });
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const handleTrashBackup = async () => {
    if (!usage?.legacyBackupBytes) return;
    const ok = await confirm({
      title: 'Sicherungskopie in den Papierkorb legen?',
      message: `Die Kopie der alten Datendatei (${formatBytes(usage.legacyBackupBytes)}) stammt von der Umstellung der Bilder auf einzelne Dateien. Wenn alle Bilder da sind, brauchst du sie nicht mehr.`,
      confirmLabel: 'In den Papierkorb',
    });
    if (!ok) return;
    try {
      const done = await api?.trashLegacyBackup?.();
      notify(
        done ? 'Sicherungskopie in den Papierkorb gelegt.' : 'Die Sicherungskopie ließ sich nicht verschieben.',
        { kind: done ? 'success' : 'error' }
      );
    } catch {
      notify('Die Sicherungskopie ließ sich nicht verschieben.', { kind: 'error' });
    }
    void refresh();
  };

  return (
    <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-4 py-5 sm:p-6">
        <h2 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100">Bildablage</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Deine Fotos liegen als Dateien neben der Datendatei. Ersetzt du ein Bild oder löschst einen
          Eintrag, bleibt die Datei liegen, bis du hier aufräumst. Dateien der letzten Stunde bleiben
          dabei unberührt.
        </p>

        {!supported && (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Die Bildablage gibt es nur in der installierten App.
          </p>
        )}

        {supported && usage && (
          <>
            <div className="mt-4 space-y-1 text-sm text-gray-700 dark:text-gray-200">
              <p>{describeUsage(usage)}</p>
              {describeOrphans(usage) && <p>{describeOrphans(usage)}</p>}
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={handleCleanup}
                disabled={busy || usage.blocked || usage.orphanFiles === 0}
                className={secondaryButtonClass}
              >
                <TrashIcon className="h-5 w-5" aria-hidden="true" />
                Aufräumen
              </button>
            </div>

            {usage.legacyBackupBytes !== null && (
              <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Sicherungskopie der alten Datendatei
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Bei der Umstellung der Bilder auf einzelne Dateien hat die App eine Kopie der alten
                  Datendatei angelegt ({formatBytes(usage.legacyBackupBytes)}). Wenn alle Bilder da sind,
                  kannst du sie löschen.
                </p>
                <button type="button" onClick={handleTrashBackup} className={`${secondaryButtonSmallClass} mt-3`}>
                  In den Papierkorb legen
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ImageStorageSection;
