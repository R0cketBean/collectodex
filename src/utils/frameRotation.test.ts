import { describe, expect, it } from 'vitest';
import { detectRotation, rotateSquare } from './frameRotation';

const SIZE = 48;
// Unsymmetrisches Motiv: helles „L“ auf dunklem Grund, wie eine Karte mit Text unten links.
const scene = (shift = 0) => {
  const f = new Uint8Array(SIZE * SIZE).fill(30);
  for (let y = 6; y < 42; y++) for (let x = 12 + shift; x < 20 + shift; x++) f[y * SIZE + x] = 220;
  for (let y = 34; y < 42; y++) for (let x = 12 + shift; x < 36 + shift; x++) f[y * SIZE + x] = 220;
  return f;
};

describe('rotateSquare', () => {
  it('dreht im Uhrzeigersinn: oben links wandert nach oben rechts', () => {
    const f = new Uint8Array(4).fill(0);
    f[0] = 9; // (0,0)
    expect([...rotateSquare(f, 2, 1)]).toEqual([0, 9, 0, 0]);
    expect([...rotateSquare(f, 2, 2)]).toEqual([0, 0, 0, 9]);
    expect([...rotateSquare(f, 2, 3)]).toEqual([0, 0, 9, 0]);
  });

  it('ergibt nach vier Vierteldrehungen wieder das Bild', () => {
    const f = scene();
    expect(rotateSquare(rotateSquare(f, SIZE, 1), SIZE, 3)).toEqual(f);
    expect(rotateSquare(rotateSquare(f, SIZE, 2), SIZE, 2)).toEqual(f);
  });
});

describe('detectRotation', () => {
  it('erkennt, um wie viel das Bild zurückgedreht werden muss', () => {
    const before = scene();
    // Kamera hat das Bild um 90° gegen den Uhrzeigersinn gedreht → 1× im Uhrzeigersinn zurück.
    expect(detectRotation(before, rotateSquare(before, SIZE, 3), SIZE)).toBe(1);
    expect(detectRotation(before, rotateSquare(before, SIZE, 1), SIZE)).toBe(3);
    expect(detectRotation(before, rotateSquare(before, SIZE, 2), SIZE)).toBe(2);
  });

  it('sieht in ruhigen oder leicht bewegten Bildern keine Drehung', () => {
    expect(detectRotation(scene(), scene(), SIZE)).toBe(0);
    expect(detectRotation(scene(), scene(1), SIZE)).toBe(0);
  });

  it('hält eine andere Karte nicht für eine Drehung', () => {
    const other = new Uint8Array(SIZE * SIZE).fill(30);
    for (let y = 10; y < 20; y++) for (let x = 5; x < 45; x++) other[y * SIZE + x] = 200;
    expect(detectRotation(scene(), other, SIZE)).toBe(0);
  });
});
