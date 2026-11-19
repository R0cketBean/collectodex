// Kartenscanner, Live-Kamera (#169): gleicht aus, dass das iPhone als Kamera
// sein Bild je nach Haltung selbst dreht (flach gehalten springt es zwischen
// den Richtungen). Verglichen werden kleine, quadratische Graustufenbilder:
// Springt das Bild plötzlich und passt das neue, um 90°/180°/270° gedreht,
// viel besser zum vorigen, war es eine Drehung – und die wird zurückgedreht.
//
// Quadratisch, weil das Kamerabild beim Drehen Breite und Höhe tauscht; auf
// ein Quadrat skaliert entspricht das genau einer Drehung des Quadrats.

import { frameDifference, type GrayFrame } from './autoCapture';

export type QuarterTurns = 0 | 1 | 2 | 3;

/** Quadratisches Bild (size × size) um `turns` Vierteldrehungen im Uhrzeigersinn drehen. */
export const rotateSquare = (frame: GrayFrame, size: number, turns: number): GrayFrame => {
  const t = (((turns % 4) + 4) % 4) as QuarterTurns;
  if (t === 0) return frame;
  const out = new Uint8Array(frame.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = frame[y * size + x];
      // Zielposition nach t Vierteldrehungen im Uhrzeigersinn.
      const [nx, ny] = t === 1 ? [size - 1 - y, x] : t === 2 ? [size - 1 - x, size - 1 - y] : [y, size - 1 - x];
      out[ny * size + nx] = v;
    }
  }
  return out;
};

export interface RotationCheck {
  /** Ab dieser Abweichung zum vorigen Bild wird überhaupt geprüft. */
  jumpThreshold?: number;
  /** Gedreht muss die Abweichung höchstens so groß sein … */
  matchThreshold?: number;
  /** … und deutlich kleiner als ungedreht (Anteil). */
  ratio?: number;
}

/**
 * Um wie viele Vierteldrehungen (im Uhrzeigersinn) muss `current` gedreht
 * werden, damit es wieder zu `previous` passt? 0, wenn es keine Drehung war
 * (ruhig, bewegt oder eine andere Karte).
 */
export const detectRotation = (
  previous: GrayFrame,
  current: GrayFrame,
  size: number,
  { jumpThreshold = 18, matchThreshold = 12, ratio = 0.5 }: RotationCheck = {}
): QuarterTurns => {
  const unrotated = frameDifference(current, previous);
  if (unrotated < jumpThreshold) return 0;
  let best: QuarterTurns = 0;
  let bestDiff = unrotated;
  for (const t of [1, 2, 3] as const) {
    const d = frameDifference(rotateSquare(current, size, t), previous);
    if (d < bestDiff) {
      best = t;
      bestDiff = d;
    }
  }
  return best !== 0 && bestDiff <= matchThreshold && bestDiff <= unrotated * ratio ? best : 0;
};
