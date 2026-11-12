// Vorschaubilder für Kacheln und Listen (#128).
//
// Fotos liegen in voller Größe als Datei vor (bis mehrere Megabyte). Für eine
// Kachel reicht ein Bruchteil. Zu jedem abgelegten Bild `<name>.<endung>` gibt
// es deshalb ein Vorschaubild `<name>_thumb.webp` im selben Ordner. Es steht in
// keinem Eintrag, sondern ergibt sich aus dem Namen: Fehlt es, erzeugt das
// Fenster es einmal aus dem Original und legt es ab. So brauchen weder neue
// noch bestehende Fotos eine Umstellung der Daten.

import { IMAGE_REF_PREFIX, isImageRef, shrinkDataUrl } from './imageStorage';

/** Längste Kante eines Vorschaubilds in Pixeln (reicht für Kacheln auf Retina-Bildschirmen). */
export const THUMB_EDGE = 480;
const THUMB_SUFFIX = '_thumb';

/** Verweis auf das Vorschaubild zu einem abgelegten Bild; null für alles andere. */
export const thumbRefFor = (value: string): string | null => {
  if (!isImageRef(value)) return null;
  const match = /^([A-Za-z0-9_-]+)\.[a-z0-9]{2,5}$/.exec(value.slice(IMAGE_REF_PREFIX.length).split(/[?#]/)[0]);
  if (!match || match[1].endsWith(THUMB_SUFFIX)) return null;
  return `${IMAGE_REF_PREFIX}${match[1]}${THUMB_SUFFIX}.webp`;
};

/**
 * Kleinere Fassung einer Bildadresse aus dem Netz, wenn die Quelle eine
 * anbietet (Katalogbilder von TCGdex und pokemontcg.io); sonst die Adresse selbst.
 */
export const smallRemoteImage = (url: string): string =>
  url.startsWith('https://assets.tcgdex.net/')
    ? url.replace(/\/high\.(webp|png|jpg)$/, '/low.$1')
    : url.startsWith('https://images.pokemontcg.io/')
      ? url.replace(/_hires\.png$/, '.png')
      : url;

// In dieser Sitzung erzeugte Vorschaubilder; die Adresse bekommt dann einen
// Zusatz, damit das Fenster nicht die zuvor fehlgeschlagene Anfrage wiederholt.
const created = new Set<string>();

/** Adresse, unter der eine Vorschau zuerst versucht wird. */
export const previewSource = (value: string): string => {
  const thumb = thumbRefFor(value);
  if (!thumb) return smallRemoteImage(value);
  return created.has(value) ? `${thumb}?v=1` : thumb;
};

const pending = new Map<string, Promise<string | null>>();
// Nacheinander statt gleichzeitig: Das Verkleinern großer Fotos soll die
// Oberfläche nicht ausbremsen.
let queue: Promise<unknown> = Promise.resolve();

const createThumb = async (ref: string): Promise<string | null> => {
  const api = window.electronAPI;
  if (!api?.saveThumbnail) return null;
  const original = await api.readImage(ref);
  const small = original ? await shrinkDataUrl(original, THUMB_EDGE) : null;
  const saved = small ? await api.saveThumbnail(ref, small) : null;
  if (!saved) return null;
  created.add(ref);
  return `${saved}?v=1`;
};

/**
 * Erzeugt das Vorschaubild zu einem abgelegten Bild und liefert seine Adresse.
 * null, wenn es keine Bildablage gibt (Browser) oder das Bild sich nicht
 * verkleinern lässt – dann bleibt nur das Original.
 */
export const ensureThumb = (ref: string): Promise<string | null> => {
  if (!thumbRefFor(ref) || !window.electronAPI?.saveThumbnail) return Promise.resolve(null);
  let job = pending.get(ref);
  if (!job) {
    job = queue.then(() => createThumb(ref)).catch(() => null);
    queue = job;
    pending.set(ref, job);
  }
  return job;
};
