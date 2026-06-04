import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  ArchiveBoxArrowDownIcon,
  FolderOpenIcon,
} from '@heroicons/react/24/outline';
import { getThemeChoice, setThemeChoice, ThemeChoice } from '../utils/theme';
import { useCollectionActions } from '../context/CollectionContext';
import { wrapBackup } from '../utils/backup';
import {
  BackupSettings,
  DEFAULT_BACKUP_SETTINGS,
  loadBackupSettings,
  saveBackupSettings,
  todayKey,
} from '../utils/backupSettings';

// Settings-Tab: manuelle Update-Prüfung, Darstellung (Dark Mode), App-Version.
// Sprache/i18n und Auto-Backup ziehen als eigene Schritte hier ein.

type CheckState = 'idle' | 'checking' | 'available' | 'none' | 'error' | 'unsupported';

const THEME_OPTIONS: { value: ThemeChoice; label: string; icon: React.ElementType }[] = [
  { value: 'light', label: 'Hell', icon: SunIcon },
  { value: 'dark', label: 'Dunkel', icon: MoonIcon },
  { value: 'system', label: 'System', icon: ComputerDesktopIcon },
];

const Settings: React.FC = () => {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
  const [version, setVersion] = useState<string | undefined>(undefined);
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [detail, setDetail] = useState<string | undefined>(undefined);
  const [theme, setTheme] = useState<ThemeChoice>(getThemeChoice());
  const [backup, setBackup] = useState<BackupSettings>(DEFAULT_BACKUP_SETTINGS);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const { exportData } = useCollectionActions();

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

  const handleThemeChange = (choice: ThemeChoice) => {
    setThemeChoice(choice);
    setTheme(choice);
  };

  // --- Backups (#91) -------------------------------------------------------
  useEffect(() => {
    loadBackupSettings().then((s) => {
      if (mounted.current) setBackup(s);
    });
  }, []);

  const persistBackup = async (next: BackupSettings) => {
    setBackup(next);
    await saveBackupSettings(next);
  };

  const handleChooseFolder = async () => {
    const api = window.electronAPI;
    if (!api) return;
    const folder = await api.chooseBackupFolder();
    if (folder) {
      setBackupStatus(null);
      await persistBackup({ ...backup, folder });
    }
  };

  const handleToggleBackup = async () => {
    const api = window.electronAPI;
    if (!api) {
      setBackupStatus('Backups sind nur in der installierten App verfügbar.');
      return;
    }
    // Beim Aktivieren zuerst einen Ordner verlangen.
    if (!backup.enabled && !backup.folder) {
      const folder = await api.chooseBackupFolder();
      if (!folder) return; // abgebrochen -> nicht aktivieren
      await persistBackup({ ...backup, enabled: true, folder });
      return;
    }
    await persistBackup({ ...backup, enabled: !backup.enabled });
  };

  const handleKeepChange = async (keep: number) => {
    await persistBackup({ ...backup, keep });
  };

  const handleBackupNow = async () => {
    const api = window.electronAPI;
    if (!api) {
      setBackupStatus('Backups sind nur in der installierten App verfügbar.');
      return;
    }
    let folder = backup.folder;
    if (!folder) {
      folder = await api.chooseBackupFolder();
      if (!folder) return;
    }
    setBackupStatus('Sicherung läuft…');
    try {
      const json = JSON.stringify(wrapBackup(exportData()), null, 2);
      const res = await api.writeBackup({ folder, json, keep: backup.keep });
      if (res.ok) {
        await persistBackup({ ...backup, folder, lastBackup: todayKey() });
        setBackupStatus(`Gesichert: ${res.path}`);
      } else {
        setBackupStatus(`Fehler: ${res.error || 'unbekannt'}`);
      }
    } catch {
      setBackupStatus('Sicherung fehlgeschlagen.');
    }
  };

  const renderResult = () => {
    switch (checkState) {
      case 'checking':
        return <p className="text-sm text-gray-500 dark:text-gray-400">Suche nach Updates…</p>;
      case 'available':
        return (
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            {detail ? `Update verfügbar: Version ${detail}.` : 'Ein Update ist verfügbar.'} Der
            Download-Hinweis erscheint unten rechts.
          </p>
        );
      case 'none':
        return <p className="text-sm text-gray-600 dark:text-gray-300">Du bist auf dem neuesten Stand.</p>;
      case 'error':
        return (
          <p className="text-sm text-red-600 dark:text-red-400">
            {detail || 'Beim Prüfen ist ein Fehler aufgetreten.'}
          </p>
        );
      case 'unsupported':
        return (
          <p className="text-sm text-gray-500 dark:text-gray-400">
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
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Einstellungen</h1>

      {/* Darstellung / Dark Mode */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100">Darstellung</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Wähle das Erscheinungsbild. „System" folgt der Einstellung deines Betriebssystems.
          </p>

          <div className="mt-4 inline-flex flex-wrap gap-2" role="group" aria-label="Erscheinungsbild">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
              const active = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleThemeChange(value)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium border ${
                    active
                      ? 'bg-pokemon-blue text-white border-pokemon-blue'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Updates */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100">Updates</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
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

          <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
            {isElectron && version
              ? `Aktuelle Version: ${version}`
              : 'Versionsinfo nur in der installierten App verfügbar.'}
          </p>
        </div>
      </div>

      {/* Backups */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100">Backups</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Sichert deine Sammlung als vollständige JSON-Datei (inkl. Bilder). Automatisch beim
            App-Start, höchstens einmal pro Tag; ältere Sicherungen werden automatisch gelöscht.
          </p>

          {!isElectron && (
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Backups stehen nur in der installierten App zur Verfügung (nicht im
              Browser/Entwicklungsmodus).
            </p>
          )}

          {isElectron && (
            <div className="mt-4 space-y-5">
              {/* Ein/Aus */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Automatische Backups
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Beim Start sichern, sofern heute noch nicht geschehen.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={backup.enabled}
                  onClick={handleToggleBackup}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pokemon-blue ${
                    backup.enabled ? 'bg-pokemon-blue' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 mt-0.5 transform rounded-full bg-white transition-transform ${
                      backup.enabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Speicherort */}
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Speicherort</p>
                <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300 break-all flex-1">
                    {backup.folder || 'Noch kein Ordner gewählt.'}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleChooseFolder}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
                    >
                      Ordner wählen
                    </button>
                    {backup.folder && (
                      <button
                        type="button"
                        onClick={() => window.electronAPI?.openBackupFolder(backup.folder as string)}
                        className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-pokemon-blue dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        <FolderOpenIcon className="h-5 w-5" aria-hidden="true" />
                        Öffnen
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Aufbewahrung + manuelle Sicherung */}
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div>
                  <label
                    htmlFor="backup-keep"
                    className="block text-sm font-medium text-gray-900 dark:text-gray-100"
                  >
                    Backups behalten
                  </label>
                  <select
                    id="backup-keep"
                    value={backup.keep}
                    onChange={(e) => handleKeepChange(Number(e.target.value))}
                    className="mt-1 block rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-pokemon-blue focus:border-pokemon-blue"
                  >
                    {[3, 5, 10, 20].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleBackupNow}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-pokemon-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <ArchiveBoxArrowDownIcon className="h-5 w-5" aria-hidden="true" />
                  Jetzt sichern
                </button>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {backup.lastBackup
                    ? `Letztes Backup: ${backup.lastBackup}`
                    : 'Noch kein Backup erstellt.'}
                </p>
                {backupStatus && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 break-all">{backupStatus}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ausblick auf weitere Einstellungen */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100">Weitere Einstellungen</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Sprachumschaltung (DE/EN) ist in Vorbereitung und wird hier einziehen.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
