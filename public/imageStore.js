// Bildablage außerhalb der Datendatei (#120).
//
// Früher standen Bilder als Base64-Text direkt in collectodex-data.json. Die
// Datei wuchs dadurch auf zig Megabyte und wurde bei jeder Änderung komplett
// neu geschrieben. Jetzt liegt jedes Bild als Datei im Ordner `images` neben
// der Datendatei; am Eintrag steht nur noch ein Verweis der Form
// `cdx-image://local/<datei>`, den das Fenster direkt als Bildadresse nutzt.
//
// Dieses Modul enthält bewusst nichts Electron-Spezifisches, damit es sich
// ohne laufende App testen lässt.

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const IMAGE_SCHEME = 'cdx-image';
const IMAGE_REF_PREFIX = `${IMAGE_SCHEME}://local/`;

const EXT_BY_MIME = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/heic': 'heic',
};
const MIME_BY_EXT = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  heic: 'image/heic',
};

// Nur selbst erzeugte Namen zulassen – nie Pfade aus dem Fenster übernehmen.
const SAFE_FILE = /^[A-Za-z0-9_-]+\.[a-z0-9]{2,5}$/;

const isImageRef = (value) => typeof value === 'string' && value.startsWith(IMAGE_REF_PREFIX);

/** Dateiname aus einem Verweis; null, wenn der Verweis ungültig ist. */
const refToFileName = (ref) => {
  if (!isImageRef(ref)) return null;
  const name = ref.slice(IMAGE_REF_PREFIX.length).split(/[?#]/)[0];
  return SAFE_FILE.test(name) ? name : null;
};

const fileNameToRef = (name) => `${IMAGE_REF_PREFIX}${name}`;

const mimeForFile = (name) => MIME_BY_EXT[path.extname(name).slice(1).toLowerCase()] || 'application/octet-stream';

/** Zerlegt eine Base64-Data-URL eines Bildes; null bei allem anderen. */
const parseDataUrl = (dataUrl) => {
  if (typeof dataUrl !== 'string') return null;
  const match = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(dataUrl);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const buffer = Buffer.from(dataUrl.slice(match[0].length), 'base64');
  if (buffer.length === 0) return null;
  return { mime, ext: EXT_BY_MIME[mime] || 'img', buffer };
};

/** Schreibt eine Data-URL als Datei und liefert den Verweis (oder null). */
const saveDataUrl = (dir, dataUrl) => {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  fs.mkdirSync(dir, { recursive: true });
  const name = `${randomUUID()}.${parsed.ext}`;
  const target = path.join(dir, name);
  // Erst unter anderem Namen schreiben, dann umbenennen: nie halbe Dateien.
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, parsed.buffer);
  fs.renameSync(temp, target);
  if (fs.statSync(target).size !== parsed.buffer.length) {
    throw new Error(`Bild wurde unvollständig geschrieben: ${name}`);
  }
  return fileNameToRef(name);
};

/** Absoluter Pfad zu einem Verweis; null, wenn ungültig oder nicht vorhanden. */
const resolveRef = (dir, ref) => {
  const name = refToFileName(ref);
  if (!name) return null;
  const file = path.join(dir, name);
  return fs.existsSync(file) ? file : null;
};

/** Liest ein ausgelagertes Bild wieder als Data-URL (für Export und Backup). */
const readAsDataUrl = (dir, ref) => {
  const file = resolveRef(dir, ref);
  if (!file) return null;
  return `data:${mimeForFile(file)};base64,${fs.readFileSync(file).toString('base64')}`;
};

/**
 * Lagert alle Base64-Bilder der Einträge aus. Liefert neue Einträge; die
 * übergebenen bleiben unverändert. Bilder, die sich nicht auslagern lassen
 * (keine Bild-Data-URL), bleiben, wie sie sind.
 */
const externalizeItems = (items, dir) => {
  let moved = 0;
  const result = (Array.isArray(items) ? items : []).map((item) => {
    const images = item && item.images;
    if (!images || typeof images !== 'object') return item;
    let changed = false;
    const nextImages = {};
    for (const [key, value] of Object.entries(images)) {
      const ref = typeof value === 'string' && value.startsWith('data:') ? saveDataUrl(dir, value) : null;
      if (ref) {
        nextImages[key] = ref;
        changed = true;
        moved += 1;
      } else {
        nextImages[key] = value;
      }
    }
    return changed ? { ...item, images: nextImages } : item;
  });
  return { items: result, moved };
};

const countInlineImages = (items) =>
  (Array.isArray(items) ? items : []).reduce(
    (n, item) =>
      n +
      Object.values((item && item.images) || {}).filter(
        (v) => typeof v === 'string' && v.startsWith('data:')
      ).length,
    0
  );

/**
 * Einmalige Umstellung einer bestehenden Datendatei.
 *
 * Reihenfolge mit Absicht: erst Sicherungskopie, dann alle Bilddateien
 * schreiben, erst zum Schluss die Einträge ersetzen. Bricht etwas vorher ab,
 * bleibt die Datendatei unverändert und der nächste Start versucht es erneut.
 *
 * @param {object} options
 * @param {() => unknown[]} options.readItems   liest die Einträge
 * @param {(items: unknown[]) => void} options.writeItems  schreibt sie zurück
 * @param {string} options.storeFile   Pfad der Datendatei (für die Kopie)
 * @param {string} options.backupFile  Zielpfad der Sicherungskopie
 * @param {string} options.dir         Bilderordner
 */
const migrateInlineImages = ({ readItems, writeItems, storeFile, backupFile, dir }) => {
  const items = readItems();
  const inline = countInlineImages(items);
  if (inline === 0) return { migrated: 0, backupFile: null };

  if (!fs.existsSync(backupFile)) {
    fs.copyFileSync(storeFile, backupFile);
    if (fs.statSync(backupFile).size !== fs.statSync(storeFile).size) {
      throw new Error('Sicherungskopie der Datendatei ist unvollständig.');
    }
  }
  const { items: nextItems, moved } = externalizeItems(items, dir);
  writeItems(nextItems);
  return { migrated: moved, backupFile };
};

module.exports = {
  IMAGE_SCHEME,
  IMAGE_REF_PREFIX,
  isImageRef,
  refToFileName,
  fileNameToRef,
  mimeForFile,
  parseDataUrl,
  saveDataUrl,
  resolveRef,
  readAsDataUrl,
  externalizeItems,
  countInlineImages,
  migrateInlineImages,
};
