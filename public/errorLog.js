// Fehlerprotokoll (#136).
//
// Fehler und Warnungen aus Hauptprozess und Fenster landen in einer
// Textdatei neben der Datendatei. Sie verlässt den Rechner nie von selbst –
// der Nutzer kann sie in den Einstellungen ansehen oder exportieren und bei
// einem Problem mitschicken.
//
// Dieses Modul enthält bewusst nichts Electron-Spezifisches, damit es sich
// ohne laufende App testen lässt.

const fs = require('fs');
const os = require('os');
const path = require('path');

const LOG_FILE = 'collectodex.log';
/** Ab dieser Größe wird die Datei einmal weggeschoben (`.1`); mehr wird nicht aufgehoben. */
const MAX_BYTES = 1024 * 1024;
const MAX_ENTRY_CHARS = 8000;
/** Schutz vor einer Fehlerschleife im Fenster, die sonst die Platte füllt. */
const MAX_PER_MINUTE = 120;

const describe = (value) => {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
};

function createErrorLog({
  dir,
  maxBytes = MAX_BYTES,
  maxPerMinute = MAX_PER_MINUTE,
  home = os.homedir(),
  now = () => new Date(),
}) {
  const file = path.join(dir, LOG_FILE);
  const previousFile = `${file}.1`;

  // Der Benutzername steckt in fast jedem Pfad; im Protokoll steht stattdessen `~`.
  const scrub = (text) => (home && home.length > 1 ? text.split(home).join('~') : text);

  let windowStart = 0;
  let countInWindow = 0;
  const overLimit = (time) => {
    if (time - windowStart >= 60_000) {
      windowStart = time;
      countInWindow = 0;
    }
    countInWindow += 1;
    return countInWindow > maxPerMinute;
  };

  const append = (line) => {
    fs.mkdirSync(dir, { recursive: true });
    try {
      if (fs.statSync(file).size >= maxBytes) fs.renameSync(file, previousFile);
    } catch {
      // Datei gibt es noch nicht.
    }
    fs.appendFileSync(file, line, 'utf8');
  };

  /**
   * Schreibt einen Eintrag. `source` ist „main“ oder „fenster“, `level`
   * „error“ oder „warn“. Scheitert das Schreiben, passiert nichts – das
   * Protokoll darf die App nie stören.
   */
  const write = (source, level, ...parts) => {
    try {
      const time = now();
      if (overLimit(time.getTime())) {
        if (countInWindow === maxPerMinute + 1) {
          append(`${time.toISOString()} [${source}] WARN Zu viele Meldungen – weitere werden für eine Minute ausgelassen.\n`);
        }
        return;
      }
      const text = scrub(parts.map(describe).join(' ')).slice(0, MAX_ENTRY_CHARS);
      const tag = level === 'warn' ? 'WARN' : 'ERROR';
      append(`${time.toISOString()} [${source === 'fenster' ? 'fenster' : 'main'}] ${tag} ${text}\n`);
    } catch {
      // siehe oben
    }
  };

  const readFile = (target) => {
    try {
      return fs.readFileSync(target, 'utf8');
    } catch {
      return '';
    }
  };

  /** Gesamter Inhalt, ältere Hälfte zuerst. */
  const read = () => readFile(previousFile) + readFile(file);

  /** Größe und Stand für die Anzeige in den Einstellungen. */
  const info = () => {
    let bytes = 0;
    let updatedAt = null;
    for (const target of [previousFile, file]) {
      try {
        const stat = fs.statSync(target);
        bytes += stat.size;
        updatedAt = stat.mtime.toISOString();
      } catch {
        // fehlt
      }
    }
    return { bytes, updatedAt, exists: fs.existsSync(file) };
  };

  /** Text für den Export: Kopfzeilen zur Umgebung, danach das Protokoll. */
  const buildExport = (environment = {}) => {
    const head = ['CollectODex – Fehlerprotokoll', `Erstellt: ${now().toISOString()}`];
    for (const [label, value] of Object.entries(environment)) head.push(`${label}: ${value}`);
    const body = read();
    return `${head.join('\n')}\n${'-'.repeat(60)}\n${body || '(keine Einträge)\n'}`;
  };

  return { file, write, read, info, buildExport };
}

module.exports = { createErrorLog, LOG_FILE, MAX_BYTES, MAX_ENTRY_CHARS, MAX_PER_MINUTE };
