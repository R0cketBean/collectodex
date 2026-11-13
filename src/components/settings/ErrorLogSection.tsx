import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDownTrayIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { secondaryButtonClass } from '../../utils/formStyles';
import { formatBytes } from '../../utils/format';
import type { LogInfo } from '../../types/electron';

// Einstellungen: Fehlerprotokoll ansehen und exportieren (#136). Die Datei
// führt der Hauptprozess (public/errorLog.js); sie bleibt auf dem Rechner.

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

/** Statuszeile unter den Knöpfen. */
export const describeLog = (info: LogInfo | null): string => {
  if (!info) return '';
  if (info.bytes === 0) return 'Noch keine Einträge.';
  const size = formatBytes(info.bytes);
  return info.updatedAt
    ? `${size}, letzter Eintrag am ${dateFormat.format(new Date(info.updatedAt))}.`
    : `${size}.`;
};

const ErrorLogSection: React.FC = () => {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const supported = !!api?.getLogInfo;
  const [info, setInfo] = useState<LogInfo | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await window.electronAPI?.getLogInfo?.();
      if (next) setInfo(next);
    } catch {
      // Ohne Angaben bleibt die Statuszeile leer.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleOpen = async () => {
    setStatus(null);
    try {
      const opened = await api?.openLog?.();
      if (!opened) setStatus('Das Protokoll ließ sich nicht öffnen. Exportiere es stattdessen.');
    } catch {
      setStatus('Das Protokoll ließ sich nicht öffnen. Exportiere es stattdessen.');
    }
  };

  const handleExport = async () => {
    setStatus(null);
    try {
      const result = await api?.exportLog?.();
      if (!result || result.canceled) return;
      setStatus(result.ok ? `Gespeichert: ${result.path}` : `Fehler: ${result.error || 'unbekannt'}`);
    } catch {
      setStatus('Export fehlgeschlagen.');
    }
    void refresh();
  };

  return (
    <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-4 py-5 sm:p-6">
        <h2 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100">Fehlerprotokoll</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Tritt ein Fehler auf, hält die App ihn in einer Textdatei auf diesem Rechner fest. Die Datei
          wird nie von selbst übertragen. Bei einem Problem kannst du sie exportieren und mitschicken.
        </p>

        {!supported && (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Das Protokoll steht nur in der installierten App zur Verfügung.
          </p>
        )}

        {supported && (
          <>
            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleOpen}
                disabled={!info?.exists}
                className={secondaryButtonClass}
              >
                <DocumentTextIcon className="h-5 w-5" aria-hidden="true" />
                Protokoll anzeigen
              </button>
              <button type="button" onClick={handleExport} className={secondaryButtonClass}>
                <ArrowDownTrayIcon className="h-5 w-5" aria-hidden="true" />
                Exportieren…
              </button>
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">{describeLog(info)}</p>
              {status && (
                <p className="text-sm text-gray-600 dark:text-gray-300 break-all" role="status">
                  {status}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ErrorLogSection;
