import { describe, expect, it } from 'vitest';
import { createAutoCapture, frameContrast, frameDifference, toGray } from './autoCapture';

const SIZE = 64 * 48;
const flat = (value: number) => new Uint8Array(SIZE).fill(value);
// „Karte“: helles Rechteck auf dunklem Grund, verschiebbar.
const card = (offset = 0, bright = 220) => {
  const f = flat(30);
  for (let y = 10; y < 38; y++) for (let x = 20 + offset; x < 40 + offset; x++) f[y * 64 + x] = bright;
  return f;
};
const feedAll = (frames: Uint8Array[]) => {
  const auto = createAutoCapture();
  return frames.map((f) => auto.feed(f));
};

describe('Hilfsfunktionen', () => {
  it('rechnet RGBA in Graustufen um', () => {
    expect([...toGray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255])]).toEqual([255, 0, 76]);
  });

  it('misst Abweichung und Kontrast', () => {
    expect(frameDifference(flat(10), flat(20))).toBe(10);
    expect(frameDifference(flat(10), new Uint8Array(3))).toBe(255);
    expect(frameContrast(flat(100))).toBe(0);
    expect(frameContrast(card())).toBeGreaterThan(50);
  });
});

describe('createAutoCapture', () => {
  it('löst aus, sobald die Karte einige Bilder lang ruhig liegt', () => {
    const results = feedAll([card(0), card(4), card(8), card(8), card(8), card(8), card(8)]);
    expect(results.indexOf(true)).toBe(6);
  });

  it('löst bei derselben Karte kein zweites Mal aus, bei einer neuen schon', () => {
    const auto = createAutoCapture();
    const run = (frames: Uint8Array[]) => frames.map((f) => auto.feed(f)).filter(Boolean).length;
    expect(run(Array.from({ length: 6 }, () => card(0)))).toBe(1);
    expect(run(Array.from({ length: 10 }, () => card(0)))).toBe(0);
    // Karte gewechselt: kurz Bewegung, dann eine andere Karte an anderer Stelle.
    expect(run([card(6, 120), card(12, 160), ...Array.from({ length: 6 }, () => card(14, 160))])).toBe(1);
  });

  it('löst bei leerem Bild nicht aus', () => {
    expect(feedAll(Array.from({ length: 8 }, () => flat(40))).some(Boolean)).toBe(false);
  });

  it('wartet, solange sich das Bild bewegt', () => {
    expect(feedAll(Array.from({ length: 12 }, (_, i) => card(i % 2 === 0 ? 0 : 10))).some(Boolean)).toBe(false);
  });

  it('beginnt nach reset von vorn', () => {
    const auto = createAutoCapture();
    const still = Array.from({ length: 5 }, () => card(0));
    expect(still.map((f) => auto.feed(f)).filter(Boolean)).toHaveLength(1);
    auto.reset();
    expect(still.map((f) => auto.feed(f)).filter(Boolean)).toHaveLength(1);
  });
});
