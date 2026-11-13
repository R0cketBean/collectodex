// Fehler des Fensters ins Protokoll der App schreiben (#136).
//
// Der Hauptprozess führt die Protokolldatei (public/errorLog.js). Von hier
// gehen dorthin: nicht abgefangene Fehler, abgelehnte Promises ohne Behandlung
// und alles, was über console.error / console.warn ausgegeben wird. Im Browser
// ohne Electron passiert nichts.

const MAX_MESSAGE_CHARS = 8000;

const describe = (value: unknown): string => {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

/** Macht aus den Argumenten eines console-Aufrufs eine Protokollzeile. */
export const formatLogMessage = (args: unknown[]): string =>
  args.map(describe).join(' ').slice(0, MAX_MESSAGE_CHARS);

/**
 * Hängt die Meldewege ein und liefert eine Funktion, die sie wieder löst.
 * Die ursprüngliche Ausgabe in der Konsole bleibt erhalten.
 */
export const installErrorReporting = (target: Window = window): (() => void) => {
  const send = target.electronAPI?.logError;
  if (!send) return () => undefined;

  const report = (level: 'error' | 'warn', args: unknown[]) => {
    try {
      send({ level, message: formatLogMessage(args) });
    } catch {
      // Das Protokoll darf die App nie stören.
    }
  };

  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args: unknown[]) => {
    originalError(...args);
    report('error', args);
  };
  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    report('warn', args);
  };

  const onError = (event: ErrorEvent) => {
    report('error', [
      'Nicht abgefangener Fehler:',
      event.error ?? `${event.message} (${event.filename}:${event.lineno}:${event.colno})`,
    ]);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    report('error', ['Unbehandelte Ablehnung:', event.reason]);
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);

  return () => {
    console.error = originalError;
    console.warn = originalWarn;
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
};
