// Kartenscanner (#168): ruft das Swift-Hilfsprogramm „card-ocr“ (Apple
// Vision) auf und liefert die erkannten Textzeilen. Nur auf macOS.
//
// Das Fenster schickt das Foto als Data-URL; hier wird es geprüft, in eine
// temporäre Datei geschrieben, gelesen und sofort wieder gelöscht. Das Bild
// verlässt den Rechner nicht.
//
// Das Hilfsprogramm läuft dauerhaft („card-ocr --serve“): macOS übersetzt
// das Texterkennungsmodell beim Kaltstart neu für die Neural Engine (gemessen
// 30–70 s). Ein laufender Prozess behält es geladen; der Scanner wärmt ihn
// beim Öffnen auf, nach längerer Pause wird er beendet.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Fotos vom iPhone sind 3–8 MB; als Data-URL gut ein Drittel mehr.
const MAX_DATA_URL_LENGTH = 40 * 1024 * 1024;
// Aufwärmen nach einem Kaltstart: bis das Modell übersetzt ist.
const READY_TIMEOUT_MS = 120000;
// Ein Foto, wenn das Modell geladen ist (dauert sonst unter einer Sekunde).
const JOB_TIMEOUT_MS = 20000;
// Ohne Scan so lange laufen lassen, dann Speicher freigeben.
const IDLE_MS = 15 * 60 * 1000;
const DATA_URL = /^data:image\/(png|jpe?g|heic|heif|webp|tiff|gif|bmp);base64,/i;

/**
 * Pfad zum Hilfsprogramm: in der gepackten App unter Resources/bin, in der
 * Entwicklung unter native/bin (gebaut mit scripts/build-card-ocr.mjs).
 */
const binaryPath = ({ isPackaged, resourcesPath, appRoot }) =>
  isPackaged ? path.join(resourcesPath, 'bin', 'card-ocr') : path.join(appRoot, 'native', 'bin', 'card-ocr');

const isAvailable = (binary, platform = process.platform) => platform === 'darwin' && fs.existsSync(binary);

/** Prüft die Data-URL und liefert Dateiendung und Inhalt; wirft bei ungültigen Daten. */
const decodeImage = (dataUrl) => {
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error('Bild fehlt oder ist zu groß.');
  }
  const match = DATA_URL.exec(dataUrl);
  if (!match) throw new Error('Kein unterstütztes Bildformat.');
  const ext = match[1].toLowerCase().replace('jpeg', 'jpg');
  const data = Buffer.from(dataUrl.slice(match[0].length), 'base64');
  if (data.length === 0) throw new Error('Bild ist leer.');
  return { ext, data };
};

/** Liest die Ausgabe des Hilfsprogramms und behält nur die erwarteten Felder. */
const parseOutput = (output) => {
  const raw = typeof output === 'string' ? JSON.parse(output) : output;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const lines = Array.isArray(raw.lines) ? raw.lines : [];
  return {
    width: num(raw.width),
    height: num(raw.height),
    cardDetected: raw.cardDetected === true,
    lines: lines
      .filter((l) => l && typeof l.text === 'string')
      .map((l) => ({
        text: l.text,
        confidence: num(l.confidence),
        pass: l.pass === 'bottom' ? 'bottom' : 'full',
        x: num(l.x),
        y: num(l.y),
        w: num(l.w),
        h: num(l.h),
      })),
  };
};

/**
 * Hält das Hilfsprogramm im Dauerbetrieb. Aufträge laufen nacheinander; ein
 * Auftrag wartet, bis das Programm bereit ist. Stürzt es ab oder antwortet
 * nicht, wird es beendet und beim nächsten Auftrag neu gestartet.
 */
function createWorker(binary, { spawnFn = spawn, readyMs = READY_TIMEOUT_MS, jobMs = JOB_TIMEOUT_MS, idleMs = IDLE_MS } = {}) {
  let proc = null;
  let idleTimer = null;
  let chain = Promise.resolve();

  const stop = () => {
    clearTimeout(idleTimer);
    if (!proc) return;
    const current = proc;
    proc = null;
    current.fail(new Error('Die Texterkennung wurde beendet.'));
    current.child.kill();
  };

  const start = () => {
    const child = spawnFn(binary, ['--serve'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '';
    let stderr = '';
    let waiting = null; // { resolve, reject } für die nächste Zeile
    let markReady;
    let failReady;
    const ready = new Promise((resolve, reject) => {
      markReady = resolve;
      failReady = reject;
    });
    ready.catch(() => {});
    const self = {
      child,
      ready,
      next: () => new Promise((resolve, reject) => (waiting = { resolve, reject })),
      fail: (error) => {
        failReady(error);
        if (waiting) waiting.reject(error);
        waiting = null;
      },
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.ready === true) {
          markReady();
        } else if (waiting) {
          const w = waiting;
          waiting = null;
          w.resolve(message);
        }
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    const ended = (reason) => {
      if (proc === self) proc = null;
      self.fail(new Error(String(stderr).trim() || reason));
    };
    child.on('error', (error) => ended(error.message));
    child.on('exit', () => ended('Die Texterkennung wurde unerwartet beendet.'));
    child.stdin.on('error', () => {});
    return self;
  };

  const withTimeout = (promise, ms, message) => {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  };

  const touch = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(stop, idleMs);
    if (typeof idleTimer.unref === 'function') idleTimer.unref();
  };

  const ensure = () => {
    proc ??= start();
    touch();
    return proc;
  };

  const job = async (file, preview) => {
    const current = ensure();
    try {
      await withTimeout(current.ready, readyMs, 'Die Texterkennung startet nicht.');
      const answer = current.next();
      current.child.stdin.write(`${JSON.stringify({ image: file, preview })}\n`);
      const message = await withTimeout(answer, jobMs, 'Die Texterkennung antwortet nicht.');
      if (typeof message.error === 'string') throw new Error(message.error);
      return message;
    } catch (error) {
      // Hängt das Programm, beim nächsten Mal frisch starten.
      if (/startet nicht|antwortet nicht/.test(error.message) && proc === current) stop();
      throw error;
    } finally {
      touch();
    }
  };

  return {
    /** Startet das Programm, falls nötig, ohne zu warten. */
    warmUp: () => {
      ensure();
    },
    /** Liest ein Bild; liefert die Ausgabe des Programms (noch ungeprüft). */
    run: (file, preview) => {
      const result = chain.then(() => job(file, preview));
      chain = result.catch(() => {});
      return result;
    },
    stop,
  };
}

/** Erkennt den Text einer Karte im übergebenen Foto (Data-URL). */
async function recognize(run, dataUrl) {
  const { ext, data } = decodeImage(dataUrl);
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'collectodex-scan-'));
  const file = path.join(dir, `karte.${ext}`);
  const preview = path.join(dir, 'vorschau.jpg');
  try {
    await fs.promises.writeFile(file, data);
    const result = parseOutput(await run(file, preview));
    // Vorschau der (entzerrten) Karte – auch für HEIC, das das Fenster nicht anzeigen kann.
    const jpeg = await fs.promises.readFile(preview).catch(() => null);
    return { ...result, preview: jpeg ? `data:image/jpeg;base64,${jpeg.toString('base64')}` : null };
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

module.exports = { binaryPath, isAvailable, decodeImage, parseOutput, createWorker, recognize, MAX_DATA_URL_LENGTH };
