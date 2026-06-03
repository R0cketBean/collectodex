import React, { useEffect, useRef, useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

// Settings-Tab. Erste Ausbaustufe: manuelle Update-Prüfung + App-Version.
// Weitere Einstellungen (Dark Mode, Sprache/i18n, Auto-Backup) ziehen als
// eigene Schritte hier ein.

type CheckState = 'idle' | 'checking' | 'available' | 'none' | 'error' | 'unsupported';

const Settings: React.FC = () => {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
  const [version, setVersion] = useState<string | undefined>(undefined);
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [detail, setDetail] = useState<string | undefined>(undefined);

  // Vermeidet ein State-Update, falls eine Update-Event nach dem Unmount kommt.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const api = window.electronAPI;
    if (!api) {
      return;
    }

    api.getAppVersion().then((v) => {
      if (mounted.current) setVersion(v);
    });

    // Die Ergebnisse der manuellen Prüfung laufen über dieselben Events wie der
    // automatische Start-Check.
    const unsubscribers = [
      api.onUpdateAvailable((info) => {
        if (!mounted.current) return;
        setDetail(info?.version);
        setCheckState('available');
      }),
      api.onUpdateNone(() => {
        if (!mounted.current) return;
        setCheckState('none');
      }),
      api.onUpdateError((info) => {
        if (!mounted.current) return;
        setDetail(info?.message);
        setCheckState('error');
      }),
    ];

    return () => {
      mounted.current = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const handleCheck = async () => {
    const api = window.electronAPI;
    if (!api) {
      setCheckState('unsupported');
      return;
    }
    setDetail(undefined);
    setCheckState('checking');
    try {
      const result = await api.checkForUpdates();
      if (!result?.supported) {
        if (mounted.current) setCheckState('unsupported');
      }
      // Bei supported === true folgt die Rückmeldung über die *-Events.
    } catch {
      if (mounted.current) setCheckState('error');
    }
  };

  const renderResult = () => {
    switch (checkState) {
      case 'checking':
        return <p className="text-sm text-gray-500">Suche nach Updates…</p>;
      case 'available':
        return (
          <p className="text-sm font-medium text-green-700">
            {detail ? `Update verfügbar: Version ${detail}.` : 'Ein Update ist verfügbar.'} Der
            Download-Hinweis erscheint unten rechts.
          </p>
        );
      case 'none':
        return <p className="text-sm text-gray-600">Du bist auf dem neuesten Stand.</p>;
      case 'error':
        return (
          <p className="text-sm text-red-600">
            {detail || 'Beim Prüfen ist ein Fehler aufgetreten.'}
          </p>
        );
      case 'unsupported':
        return (
          <p className="text-sm text-gray-500">
            Die Update-Prüfung steht nur in der installierten App zur Verfügung (nicht im
            Browser/Entwicklungsmodus).
          </p>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Einstellungen</h1>

      {/* Updates */}
      <div className="mt-6 bg-white rounded-lg shadow">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-base sm:text-lg font-medium text-gray-900">Updates</h2>
          <p className="mt-1 text-sm text-gray-500">
            Die App prüft beim Start automatisch auf neue Versionen. Hier kannst du jederzeit
            manuell prüfen.
          </p>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              type="button"
              onClick={handleCheck}
              disabled={checkState === 'checking'}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-pokemon-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <ArrowPathIcon
                className={`h-5 w-5 ${checkState === 'checking' ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Auf Updates prüfen
            </button>
            <div className="min-h-[1.25rem]">{renderResult()}</div>
          </div>

          <p className="mt-4 text-xs text-gray-400">
            {isElectron && version
              ? `Aktuelle Version: ${version}`
              : 'Versionsinfo nur in der installierten App verfügbar.'}
          </p>
        </div>
      </div>

      {/* Ausblick auf weitere Einstellungen */}
      <div className="mt-6 bg-white rounded-lg shadow">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-base sm:text-lg font-medium text-gray-900">Weitere Einstellungen</h2>
          <p className="mt-1 text-sm text-gray-500">
            Dark Mode, Sprachumschaltung (DE/EN) und automatische Backups sind in Vorbereitung und
            werden hier einziehen.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
