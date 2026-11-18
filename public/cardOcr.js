// Kartenscanner (#168): ruft das Swift-Hilfsprogramm „card-ocr“ (Apple
// Vision) auf und liefert die erkannten Textzeilen. Nur auf macOS.
//
// Das Fenster schickt das Foto als Data-URL; hier wird es geprüft, in eine
// temporäre Datei geschrieben, gelesen und sofort wieder gelöscht. Das Bild
// verlässt den Rechner nicht.

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Fotos vom iPhone sind 3–8 MB; als Data-URL gut ein Drittel mehr.
const MAX_DATA_URL_LENGTH = 40 * 1024 * 1024;
const TIMEOUT_MS = 20000;
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
const parseOutput = (stdout) => {
  const raw = JSON.parse(stdout);
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

const run = (binary, file, preview) =>
  new Promise((resolve, reject) => {
    execFile(binary, [file, preview], { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const reason = String(stderr || '').trim() || error.message;
        reject(new Error(`Texterkennung fehlgeschlagen: ${reason}`));
      } else {
        resolve(stdout);
      }
    });
  });

/** Erkennt den Text einer Karte im übergebenen Foto (Data-URL). */
async function recognize(binary, dataUrl) {
  const { ext, data } = decodeImage(dataUrl);
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'collectodex-scan-'));
  const file = path.join(dir, `karte.${ext}`);
  const preview = path.join(dir, 'vorschau.jpg');
  try {
    await fs.promises.writeFile(file, data);
    const result = parseOutput(await run(binary, file, preview));
    // Vorschau der (entzerrten) Karte – auch für HEIC, das das Fenster nicht anzeigen kann.
    const jpeg = await fs.promises.readFile(preview).catch(() => null);
    return { ...result, preview: jpeg ? `data:image/jpeg;base64,${jpeg.toString('base64')}` : null };
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

module.exports = { binaryPath, isAvailable, decodeImage, parseOutput, recognize, MAX_DATA_URL_LENGTH };
