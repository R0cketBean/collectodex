// Bildablage aus Sicht des Fensters (#120).
//
// In der installierten App liegen Bilder als Dateien neben der Datendatei; am
// Eintrag steht ein Verweis `cdx-image://local/<datei>`, der direkt als
// Bildadresse funktioniert (siehe public/imageStore.js). Im Browser ohne
// Electron gibt es diese Ablage nicht – dort bleiben Bilder Data-URLs.

import type { CollectionItem } from '../types/models';

export const IMAGE_REF_PREFIX = 'cdx-image://local/';

/** Längste Kante neuer Bilder in Pixeln. */
export const MAX_IMAGE_EDGE = 1600;
const WEBP_QUALITY = 0.85;

export const isImageRef = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(IMAGE_REF_PREFIX);

export const isDataUrl = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('data:');

/** Zielgröße beim Verkleinern; vergrößert wird nie. */
export const fitWithin = (width: number, height: number, maxEdge = MAX_IMAGE_EDGE) => {
  const longest = Math.max(width, height);
  if (!(longest > maxEdge)) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

const readFileAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Datei nicht lesbar'));
    reader.onerror = () => reject(reader.error ?? new Error('Datei nicht lesbar'));
    reader.readAsDataURL(file);
  });

/**
 * Verkleinert ein Foto auf höchstens MAX_IMAGE_EDGE und wandelt es in WebP.
 * Klappt das nicht (unbekanntes Format, kein Canvas), bleibt das Original.
 * Ist das Ergebnis größer als das Original, bleibt ebenfalls das Original.
 */
export const prepareImageFile = async (file: Blob): Promise<string> => {
  const original = await readFileAsDataUrl(file);
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const resized = canvas.toDataURL('image/webp', WEBP_QUALITY);
    return resized.startsWith('data:image/webp') && resized.length < original.length ? resized : original;
  } catch {
    return original;
  }
};

/**
 * Verkleinert ein Bild (als Data-URL) auf höchstens `maxEdge` und liefert es
 * als WebP. null, wenn sich das Bild nicht lesen lässt.
 */
export const shrinkDataUrl = async (dataUrl: string, maxEdge: number, quality = 0.8): Promise<string | null> => {
  try {
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const result = canvas.toDataURL('image/webp', quality);
    return result.startsWith('data:image/webp') ? result : null;
  } catch {
    return null;
  }
};

/**
 * Legt ein Bild ab und liefert den Wert für `item.images`: in der App einen
 * Verweis, sonst (oder wenn das Ablegen scheitert) die Data-URL selbst.
 */
export const storeImage = async (dataUrl: string): Promise<string> => {
  const save = window.electronAPI?.saveImage;
  if (!save || !isDataUrl(dataUrl)) return dataUrl;
  try {
    return (await save(dataUrl)) ?? dataUrl;
  } catch {
    return dataUrl;
  }
};

const mapImages = async (
  items: CollectionItem[],
  matches: (value: unknown) => value is string,
  convert: (value: string) => Promise<string | null>
): Promise<CollectionItem[]> => {
  const result: CollectionItem[] = [];
  for (const item of items) {
    const entries = Object.entries(item.images ?? {});
    if (!entries.some(([, v]) => matches(v))) {
      result.push(item);
      continue;
    }
    const images: Record<string, string> = {};
    for (const [key, value] of entries) {
      // Lässt sich ein Bild nicht umwandeln, bleibt der bisherige Wert stehen.
      images[key] = matches(value) ? ((await convert(value)) ?? value) : value;
    }
    result.push({ ...item, images });
  }
  return result;
};

/**
 * Für Export und Backup: ersetzt Verweise durch die Bilddaten, damit eine
 * Sicherung für sich allein vollständig ist.
 */
export const inlineItemImages = async (items: CollectionItem[]): Promise<CollectionItem[]> => {
  const read = window.electronAPI?.readImage;
  if (!read) return items;
  return mapImages(items, isImageRef, (ref) => read(ref).catch(() => null));
};

/** Für den Import: lagert mitgelieferte Bilddaten wieder als Dateien aus. */
export const externalizeItemImages = async (items: CollectionItem[]): Promise<CollectionItem[]> => {
  if (!window.electronAPI?.saveImage) return items;
  return mapImages(items, isDataUrl, async (dataUrl) => {
    const stored = await storeImage(dataUrl);
    return stored === dataUrl ? null : stored;
  });
};
