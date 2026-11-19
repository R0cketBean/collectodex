// Kartenscanner (#170): Bildvergleich im Fenster.
//
// Berechnet den Fingerabdruck (utils/imageFingerprint.ts) des gescannten
// Kartenbilds und der Katalogbilder. Katalogbilder kommen nur von TCGdex und
// pokemontcg.io, in kleiner Auflösung; ihr Fingerabdruck wird dauerhaft
// zwischengespeichert (IndexedDB), denn ein Artwork ändert sich nicht. Jedes
// Bild wird so höchstens einmal geladen.

import { catalogCardImageSources, englishCardImageBase } from './tcgdex';
import { englishArtworks } from './jpVintageArtwork';
import type { CatalogLang } from '../types/models';
import {
  decodeFingerprint,
  encodeFingerprint,
  fingerprint,
  fingerprintDistance,
  type Fingerprint,
} from '../utils/imageFingerprint';

/** Karte, deren Bild verglichen werden soll. */
export interface VisualCard {
  cardId: string;
  setId: string;
  localId: string;
  image?: string;
  /** Serie des Sets – damit lässt sich das englische TCGdex-Bild finden. */
  serieId?: string;
}

export interface VisualMatcher {
  /** Abstand des Kartenbilds zum Scan (0 = gleich), `null`, wenn kein Bild zu laden war. */
  distance: (card: VisualCard) => Promise<number | null>;
}

// Karten haben das Format 63 × 88 mm; Scan und Katalogbild werden auf
// dieselbe Größe gebracht, damit der Ausschnitt an derselben Stelle liegt.
const WIDTH = 252;
const HEIGHT = 352;

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    // Beide Bildquellen erlauben das (CORS); sonst ließen sich die Pixel nicht lesen.
    if (!url.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Bild nicht ladbar: ${url}`));
    img.src = url;
  });

/** Fingerabdruck eines Kartenbilds (Adresse oder Data-URL). */
export async function fingerprintOfImage(url: string): Promise<Fingerprint> {
  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Kein Zeichenkontext');
  // Katalogbilder haben transparente, abgerundete Ecken.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.drawImage(img, 0, 0, WIDTH, HEIGHT);
  return fingerprint(ctx.getImageData(0, 0, WIDTH, HEIGHT).data, WIDTH, HEIGHT);
}

// --- Zwischenspeicher ------------------------------------------------------

const DB_NAME = 'collectodex-scanner';
const STORE = 'fingerprints';

export interface FingerprintCache {
  get: (key: string) => Promise<Fingerprint | null>;
  set: (key: string, fp: Fingerprint) => Promise<void>;
}

/** Nur im Speicher – für Tests und wenn IndexedDB fehlt. */
export const memoryCache = (): FingerprintCache => {
  const map = new Map<string, Fingerprint>();
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, fp) => void map.set(key, fp),
  };
};

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** Dauerhaft in IndexedDB; fällt bei Fehlern still auf den Speicher zurück. */
export const indexedDbCache = (): FingerprintCache => {
  const memory = memoryCache();
  let db: Promise<IDBDatabase | null> | null = null;
  const open = () => {
    db ??= new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return db;
  };
  return {
    get: async (key) => {
      const hit = await memory.get(key);
      if (hit) return hit;
      const handle = await open();
      if (!handle) return null;
      try {
        const fp = decodeFingerprint(await request(handle.transaction(STORE).objectStore(STORE).get(key)));
        if (fp) await memory.set(key, fp);
        return fp;
      } catch {
        return null;
      }
    },
    set: async (key, fp) => {
      await memory.set(key, fp);
      const handle = await open();
      if (!handle) return;
      try {
        await request(handle.transaction(STORE, 'readwrite').objectStore(STORE).put(encodeFingerprint(fp), key));
      } catch {
        // Nur ein Zwischenspeicher.
      }
    },
  };
};

let sharedCache: FingerprintCache | null = null;
const defaultCache = () => (sharedCache ??= typeof indexedDB === 'undefined' ? memoryCache() : indexedDbCache());

// --- Katalogbilder ---------------------------------------------------------

/** Bildadressen einer Katalogkarte, in der Reihenfolge, in der sie versucht werden. */
export const visualSources = (card: VisualCard, lang: CatalogLang): string[] =>
  catalogCardImageSources(
    lang,
    { image: card.image, localId: card.localId },
    card.setId,
    'low',
    englishCardImageBase(card.serieId, card.setId, card.localId)
  ).map((s) => s.url);

interface MatcherOptions {
  cache?: FingerprintCache;
  fingerprintOf?: (url: string) => Promise<Fingerprint>;
}

/**
 * Vergleicht Katalogkarten mit dem gescannten Kartenbild (`scanImage`: die
 * entzerrte Karte als Data-URL). Das Artwork ist in allen Sprachen gleich;
 * der Zwischenspeicher gilt deshalb je Karte, nicht je Bildquelle.
 */
export function createVisualMatcher(scanImage: string, lang: CatalogLang, options: MatcherOptions = {}): VisualMatcher {
  const cache = options.cache ?? defaultCache();
  const fingerprintOf = options.fingerprintOf ?? fingerprintOfImage;
  const scan = fingerprintOf(scanImage);
  // Bilder, die gerade nicht zu laden waren, in dieser Sitzung nicht erneut versuchen.
  const missing = new Set<string>();

  const catalogFingerprint = async (card: VisualCard, cardLang: CatalogLang): Promise<Fingerprint | null> => {
    const key = `${cardLang === 'ja' ? 'ja' : 'intl'}:${card.cardId}`;
    const cached = await cache.get(key);
    if (cached) return cached;
    if (missing.has(key)) return null;
    for (const url of visualSources(card, cardLang)) {
      try {
        const fp = await fingerprintOf(url);
        await cache.set(key, fp);
        return fp;
      } catch {
        // Nächste Quelle versuchen.
      }
    }
    missing.add(key);
    return null;
  };

  return {
    distance: async (card) => {
      const [own, other] = await Promise.all([scan, catalogFingerprint(card, lang)]);
      if (other) return fingerprintDistance(own, other);
      // Japanische Vintage-Karte ohne Bild (#180): mit den englischen Karten
      // desselben Artworks vergleichen, der nächste zählt.
      const twins = lang === 'ja' ? englishArtworks(card.cardId) : [];
      const prints = await Promise.all(twins.map((twin) => catalogFingerprint(twin, 'en')));
      const distances = prints.filter((fp): fp is Fingerprint => fp !== null).map((fp) => fingerprintDistance(own, fp));
      return distances.length > 0 ? Math.min(...distances) : null;
    },
  };
}
