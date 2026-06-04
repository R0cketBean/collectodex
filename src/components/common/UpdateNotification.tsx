import React, { useEffect, useState } from 'react';

// Auto-Update-Hinweis (#20). Notify-only: Die App (Main-Prozess) prüft beim
// Start auf neue GitHub-Releases und meldet das Ergebnis über die in
// preload.js bereitgestellten electronAPI-Events. Diese Komponente zeigt einen
// dezenten Banner unten rechts und stößt Download bzw. Installation per
// Button-Klick an.
//
// Im Browser/Dev (kein window.electronAPI) rendert sie nichts.

type UpdateStatus = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';

const UpdateNotification: React.FC = () => {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [version, setVersion] = useState<string | undefined>(undefined);
  const [percent, setPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      return;
    }

    // Liefern jeweils eine Cleanup-Funktion (ipcRenderer.removeListener).
    const unsubscribers = [
      api.onUpdateAvailable((info) => {
        setVersion(info?.version);
        setStatus('available');
      }),
      api.onUpdateProgress((info) => {
        setPercent(Math.round(info?.percent ?? 0));
        setStatus('downloading');
      }),
      api.onUpdateDownloaded((info) => {
        setVersion(info?.version);
        setStatus('downloaded');
      }),
      api.onUpdateError((info) => {
        setErrorMessage(info?.message);
        setStatus('error');
      }),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  if (status === 'idle') {
    return null;
  }

  const handleDownload = () => {
    setStatus('downloading');
    setPercent(0);
    window.electronAPI?.downloadUpdate();
  };

  const handleInstall = () => {
    window.electronAPI?.installUpdate();
  };

  const handleDismiss = () => {
    setStatus('idle');
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
      <div className="p-4">
        {status === 'available' && (
          <>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Update verfügbar</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {version ? `Version ${version} steht bereit.` : 'Eine neue Version steht bereit.'}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleDismiss}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
              >
                Später
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="rounded-md bg-pokemon-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Herunterladen
              </button>
            </div>
          </>
        )}

        {status === 'downloading' && (
          <>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Update wird geladen…</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full bg-pokemon-blue transition-all duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">{percent}%</p>
          </>
        )}

        {status === 'downloaded' && (
          <>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Update bereit</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {version ? `Version ${version} wurde geladen.` : 'Das Update wurde geladen.'} Zum
              Anwenden die App neu starten.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleDismiss}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
              >
                Später
              </button>
              <button
                type="button"
                onClick={handleInstall}
                className="rounded-md bg-pokemon-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Neu starten
              </button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="text-sm font-semibold text-red-600">Update fehlgeschlagen</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {errorMessage || 'Beim Prüfen/Laden des Updates ist ein Fehler aufgetreten.'}
            </p>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleDismiss}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
              >
                Schließen
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default UpdateNotification;
