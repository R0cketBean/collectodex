import { describe, expect, it } from 'vitest';
import {
  FINGERPRINT_LENGTH,
  decodeFingerprint,
  encodeFingerprint,
  fingerprint,
  fingerprintDistance,
  imageMatches,
} from './imageFingerprint';

type Paint = (x: number, y: number) => [number, number, number];

/** RGBA-Bild aus einer Malfunktion über normierte Koordinaten (0…1). */
const image = (width: number, height: number, paint: Paint, alpha = 255) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x / width, y / height);
      data.set([r, g, b, alpha], (y * width + x) * 4);
    }
  }
  return { data, width, height };
};

const fp = (img: ReturnType<typeof image>) => fingerprint(img.data, img.width, img.height);

// Zwei „Artworks“: Kreis und Streifen, in unterschiedlichen Farben.
const circle: Paint = (x, y) => (Math.hypot(x - 0.5, y - 0.3) < 0.12 ? [220, 60, 40] : [40, 90, 200]);
const stripes: Paint = (x, y) => (Math.floor(x * 10 + y * 4) % 2 ? [240, 220, 30] : [20, 140, 60]);

describe('fingerprint', () => {
  it('hat feste Länge und hängt nicht von der Auflösung ab', () => {
    const small = fp(image(252, 352, circle));
    const large = fp(image(630, 880, circle));
    expect(small).toHaveLength(FINGERPRINT_LENGTH);
    expect(fingerprintDistance(small, large)).toBeLessThan(0.02);
  });

  it('ignoriert Helligkeit und Kontrast', () => {
    const base = fp(image(252, 352, circle));
    const darker = fp(image(252, 352, (x, y) => circle(x, y).map((v) => v * 0.6 + 20) as [number, number, number]));
    expect(fingerprintDistance(base, darker)).toBeLessThan(0.02);
  });

  it('verträgt einen leicht verschobenen Ausschnitt', () => {
    const base = fp(image(252, 352, circle));
    const shifted = fp(image(252, 352, (x, y) => circle(x + 0.01, y - 0.008)));
    expect(fingerprintDistance(base, shifted)).toBeLessThan(0.15);
  });

  it('unterscheidet verschiedene Motive deutlich', () => {
    expect(fingerprintDistance(fp(image(252, 352, circle)), fp(image(252, 352, stripes)))).toBeGreaterThan(0.3);
  });

  it('wertet Transparenz als Weiß und eine einfarbige Fläche als strukturlos', () => {
    const transparent = fp(image(50, 70, circle, 0));
    expect([...transparent].every((v) => v === 0)).toBe(true);
    expect(fingerprintDistance(transparent, fp(image(50, 70, circle)))).toBeCloseTo(0.5, 5);
  });

  it('lässt sich als Text speichern und wieder lesen', () => {
    const original = fp(image(252, 352, stripes));
    const text = encodeFingerprint(original);
    expect(text).toHaveLength(512);
    expect(decodeFingerprint(text)).toEqual(original);
    expect(decodeFingerprint('kaputt')).toBeNull();
    expect(decodeFingerprint(42)).toBeNull();
  });

  it('lehnt Fingerabdrücke falscher Länge ab', () => {
    expect(() => fingerprintDistance(new Int8Array(3), new Int8Array(3))).toThrow();
  });
});

describe('imageMatches', () => {
  const ids = (entries: Array<[string, number | null]>) => [...imageMatches(new Map(entries))].sort();

  it('nimmt den nahen Treffer', () => {
    expect(ids([['a', 0.03], ['b', 0.15], ['c', 0.31]])).toEqual(['a']);
  });

  it('lässt bei kaum unterscheidbaren Bildern alle gelten – dann entscheidet der Text', () => {
    // Gemessen: Foto von Base Set Pikachu zu Base Set / Base Set 2 / Pokémon-TCG-Pocket-Pikachu.
    expect(ids([['base1-58', 0.01], ['base4-87', 0.026], ['A1-094', 0.103]])).toEqual(['base1-58', 'base4-87']);
    // Gemessen: Base Set Glurak zu Base Set / Base Set 2 / Legendary Collection.
    expect(ids([['base1-4', 0.058], ['base4-4', 0.108], ['base6-3', 0.105], ['base1-2', 0.415]])).toEqual([
      'base1-4',
      'base4-4',
      'base6-3',
    ]);
  });

  it('nimmt nichts, wenn selbst das nächste Bild zu weit weg ist', () => {
    // Gemessen: dasselbe Pikachu-Foto zu Celebrations Pikachu (anderes Artwork).
    expect(ids([['cel25-5', 0.155], ['pl2-112', 0.199]])).toEqual([]);
  });

  it('übergeht Karten ohne Bild', () => {
    expect(ids([['a', null], ['b', 0.1], ['c', null]])).toEqual(['b']);
    expect(ids([['a', null]])).toEqual([]);
  });
});
