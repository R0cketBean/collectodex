// Kartenscanner (#170): Bildvergleich über einen kleinen Bild-Fingerabdruck.
//
// Ältere Karten (WotC-Ära, frühe deutsche Sets) tragen keinen Set-Code, und
// auf Holo-Karten ist der Name oft nicht lesbar. Das Artwork ist aber
// sprachunabhängig: Sein Fingerabdruck lässt sich mit den Katalogbildern
// vergleichen, auch wenn es dort nur das englische Bild gibt.
//
// Fingerabdruck: das Bildfeld der Karte, verkleinert auf ein Raster aus
// 16 × 16 Helligkeitswerten und je 8 × 8 Werten für zwei Farbachsen
// (Rot–Grün, Blau–Gelb). Jeder Teil wird auf Mittelwert 0 und Streuung 1
// gebracht; damit spielen Helligkeit, Kontrast und Weißabgleich der Kamera
// keine Rolle. Verglichen wird über die Korrelation.
//
// Gemessen an Katalogbildern (Base Set, Neo Genesis, Karmesin & Purpur) mit
// verschobenem, unscharfem, aufgehelltem Ausschnitt: in 150 von 150 Fällen
// war die richtige Karte die nächste. Ein Wahrnehmungs-Hash (dHash/pHash) lag
// bei denselben Bildern in 3–6 % der Fälle daneben. Fotos, die durch die
// Texterkennung entzerrt wurden, lagen 0,01–0,06 vom richtigen Katalogbild
// entfernt; dasselbe Pokémon mit anderem Artwork bei 0,10 und mehr.
//
// Bewusst ohne DOM- und Electron-Abhängigkeit (Pixel rein, Fingerabdruck
// raus), damit das Modul auch in einer mobilen App laufen kann (#173).

/** Ausschnitt einer Karte, normiert auf 0…1 (Ursprung oben links). */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Bildfeld der Karte, etwas nach innen gerückt: Der Rahmen um das Artwork
 * liegt je nach Ära etwas anders, und eine leicht ungenaue Entzerrung soll
 * nicht ins Gewicht fallen. Gilt für normale Karten von WotC bis heute.
 */
export const ARTWORK_REGION: Region = { x: 0.14, y: 0.14, w: 0.72, h: 0.3 };

const LUMA = 16;
const CHROMA = 8;
export const FINGERPRINT_LENGTH = LUMA * LUMA + 2 * CHROMA * CHROMA;

/** Fingerabdruck: normierte Werte, auf ganze Zahlen −127…127 gerundet (1/40 Streuung je Stufe). */
export type Fingerprint = Int8Array;
const SCALE = 40;

/**
 * Mittelt die Pixel eines Ausschnitts zellenweise (Flächenmittel statt
 * Abtasten, damit das Ergebnis nicht von der Auflösung des Bilds abhängt).
 * Liefert je Zelle Rot, Grün und Blau; Transparenz zählt als Weiß.
 */
const cellMeans = (rgba: ArrayLike<number>, width: number, height: number, region: Region, n: number): Float64Array => {
  const out = new Float64Array(n * n * 3);
  const x0 = region.x * width;
  const y0 = region.y * height;
  const cw = (region.w * width) / n;
  const ch = (region.h * height) / n;
  for (let r = 0; r < n; r++) {
    const ya = Math.min(height - 1, Math.max(0, Math.floor(y0 + r * ch)));
    const yb = Math.min(height, Math.max(ya + 1, Math.floor(y0 + (r + 1) * ch)));
    for (let c = 0; c < n; c++) {
      const xa = Math.min(width - 1, Math.max(0, Math.floor(x0 + c * cw)));
      const xb = Math.min(width, Math.max(xa + 1, Math.floor(x0 + (c + 1) * cw)));
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let count = 0;
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          const i = (y * width + x) * 4;
          const a = rgba[i + 3] / 255;
          sr += rgba[i] * a + 255 * (1 - a);
          sg += rgba[i + 1] * a + 255 * (1 - a);
          sb += rgba[i + 2] * a + 255 * (1 - a);
          count++;
        }
      }
      const k = (r * n + c) * 3;
      out[k] = sr / count;
      out[k + 1] = sg / count;
      out[k + 2] = sb / count;
    }
  }
  return out;
};

/** Bringt Werte auf Mittelwert 0 und Streuung 1 und schreibt sie gerundet ab `offset`. */
const writeNormalized = (values: number[], target: Int8Array, offset: number) => {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  values.forEach((v, i) => {
    // Einfarbige Fläche: keine Struktur, alles 0.
    const z = sd > 1e-6 ? (v - mean) / sd : 0;
    target[offset + i] = Math.max(-127, Math.min(127, Math.round(z * SCALE)));
  });
};

/** Fingerabdruck eines Bildausschnitts aus RGBA-Pixeln (wie aus einem Canvas). */
export const fingerprint = (
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  region: Region = ARTWORK_REGION
): Fingerprint => {
  const out = new Int8Array(FINGERPRINT_LENGTH);
  const luma = cellMeans(rgba, width, height, region, LUMA);
  const lumaValues: number[] = [];
  for (let i = 0; i < LUMA * LUMA; i++) {
    lumaValues.push(0.299 * luma[i * 3] + 0.587 * luma[i * 3 + 1] + 0.114 * luma[i * 3 + 2]);
  }
  writeNormalized(lumaValues, out, 0);
  const chroma = cellMeans(rgba, width, height, region, CHROMA);
  const redGreen: number[] = [];
  const blueYellow: number[] = [];
  for (let i = 0; i < CHROMA * CHROMA; i++) {
    const [r, g, b] = [chroma[i * 3], chroma[i * 3 + 1], chroma[i * 3 + 2]];
    redGreen.push(r - g);
    blueYellow.push(b - (r + g) / 2);
  }
  writeNormalized(redGreen, out, LUMA * LUMA);
  writeNormalized(blueYellow, out, LUMA * LUMA + CHROMA * CHROMA);
  return out;
};

/**
 * Abstand zweier Fingerabdrücke: 0 = gleiches Bild, 0,5 = ohne Zusammenhang,
 * 1 = Negativ. Halbe (1 − Korrelation).
 */
export const fingerprintDistance = (a: Fingerprint, b: Fingerprint): number => {
  if (a.length !== FINGERPRINT_LENGTH || b.length !== FINGERPRINT_LENGTH) throw new Error('Ungültiger Fingerabdruck');
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  const correlation = dot / (a.length * SCALE * SCALE);
  return Math.max(0, Math.min(1, (1 - correlation) / 2));
};

// --- Speichern -------------------------------------------------------------

/** Als Text zum Zwischenspeichern (Base64, 512 Zeichen). */
export const encodeFingerprint = (fp: Fingerprint): string => {
  let binary = '';
  for (const byte of new Uint8Array(fp.buffer, fp.byteOffset, fp.byteLength)) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/** Gegenstück zu encodeFingerprint; `null` bei ungültigem Text. */
export const decodeFingerprint = (text: unknown): Fingerprint | null => {
  if (typeof text !== 'string') return null;
  try {
    const binary = atob(text);
    if (binary.length !== FINGERPRINT_LENGTH) return null;
    const out = new Int8Array(FINGERPRINT_LENGTH);
    for (let i = 0; i < binary.length; i++) out[i] = (binary.charCodeAt(i) << 24) >> 24;
    return out;
  } catch {
    return null;
  }
};

// --- Bewertung -------------------------------------------------------------

/** Bis zu diesem Abstand kann es dasselbe Artwork sein. */
export const IMAGE_MATCH_MAX = 0.13;
/**
 * Karten mit ähnlichem Abstand zeigen dasselbe Artwork. Nachdrucke (Base Set,
 * Base Set 2, Legendary Collection) lagen beim Messen bis zu 0,05 auseinander.
 */
const SAME_ARTWORK_SPREAD = 0.07;

/**
 * Welche Kandidaten zeigen das gescannte Artwork? Der nächste, wenn er nah
 * genug ist, und alle, die kaum weiter weg liegen (Nachdrucke mit demselben
 * Artwork gelten gemeinsam – zwischen ihnen entscheidet der Text).
 * `distances`: Abstand je Kandidat, `null`, wenn kein Bild zu laden war.
 */
export const imageMatches = (distances: Map<string, number | null>): Set<string> => {
  const known = [...distances].filter((e): e is [string, number] => e[1] !== null).sort((a, b) => a[1] - b[1]);
  const best = known[0]?.[1];
  if (best === undefined || best > IMAGE_MATCH_MAX) return new Set();
  const group = known.filter(([, d]) => d <= Math.min(IMAGE_MATCH_MAX, best + SAME_ARTWORK_SPREAD));
  return new Set(group.map(([id]) => id));
};
