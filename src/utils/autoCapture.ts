// Kartenscanner, Live-Kamera (#169): entscheidet anhand kleiner Graustufen-
// Bilder des Kamerabilds, wann ausgelöst wird.
//
// Ausgelöst wird, wenn
// - das Bild einige Takte lang ruhig ist (Karte liegt still, Hand ist weg),
// - überhaupt etwas zu sehen ist (genug Kontrast, kein leeres Bild) und
// - es sich seit der letzten Aufnahme deutlich verändert hat (neue Karte).
// Ohne Abhängigkeit vom Browser, damit es testbar bleibt und später auch in
// einer mobilen App laufen kann (#173).

/** Graustufenbild in fester, kleiner Größe (z. B. 64 × 48), ein Byte je Pixel. */
export type GrayFrame = Uint8Array;

/** RGBA-Pixel (z. B. aus einem Canvas) in Graustufen umrechnen. */
export const toGray = (rgba: ArrayLike<number>): GrayFrame => {
  const gray = new Uint8Array(Math.floor(rgba.length / 4));
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] = (rgba[o] * 77 + rgba[o + 1] * 150 + rgba[o + 2] * 29) >> 8;
  }
  return gray;
};

/** Mittlere absolute Abweichung zweier gleich großer Bilder (0 … 255). */
export const frameDifference = (a: GrayFrame, b: GrayFrame) => {
  if (a.length !== b.length || a.length === 0) return 255;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
};

/** Standardabweichung der Helligkeit – ein leeres, einfarbiges Bild hat kaum welche. */
export const frameContrast = (f: GrayFrame) => {
  if (f.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < f.length; i++) sum += f[i];
  const mean = sum / f.length;
  let sq = 0;
  for (let i = 0; i < f.length; i++) sq += (f[i] - mean) ** 2;
  return Math.sqrt(sq / f.length);
};

export interface AutoCaptureOptions {
  /** Höchste Abweichung zum vorigen Bild, die noch als „ruhig“ gilt. */
  stillThreshold?: number;
  /** So viele ruhige Bilder in Folge, bevor ausgelöst wird. */
  stillFrames?: number;
  /** Mindestabweichung zur letzten Aufnahme, damit es als neue Karte zählt. */
  changeThreshold?: number;
  /** Mindestkontrast, damit überhaupt etwas im Bild ist. */
  minContrast?: number;
}

export interface AutoCapture {
  /** Nächstes Bild auswerten; `true` heißt: jetzt auslösen. */
  feed: (frame: GrayFrame) => boolean;
  /** Vergessen, was zuletzt aufgenommen wurde (z. B. nach Kamerawechsel). */
  reset: () => void;
}

export const createAutoCapture = ({
  stillThreshold = 4,
  stillFrames = 4,
  changeThreshold = 12,
  minContrast = 18,
}: AutoCaptureOptions = {}): AutoCapture => {
  let previous: GrayFrame | null = null;
  let lastCaptured: GrayFrame | null = null;
  let still = 0;

  return {
    feed(frame) {
      still = previous && frameDifference(frame, previous) <= stillThreshold ? still + 1 : 0;
      previous = frame;
      if (still < stillFrames) return false;
      if (frameContrast(frame) < minContrast) return false;
      if (lastCaptured && frameDifference(frame, lastCaptured) < changeThreshold) return false;
      lastCaptured = frame;
      still = 0;
      return true;
    },
    reset() {
      previous = null;
      lastCaptured = null;
      still = 0;
    },
  };
};
