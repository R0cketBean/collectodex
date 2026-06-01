import { describe, expect, it } from 'vitest';
import { parseDecimal } from './number';

describe('parseDecimal', () => {
  it('parst deutsche Dezimalzahlen mit Komma (Regression #31)', () => {
    expect(parseDecimal('1,50')).toBe(1.5);
    expect(parseDecimal('12,99')).toBe(12.99);
    expect(parseDecimal('0,01')).toBe(0.01);
  });

  it('parst englische Dezimalzahlen mit Punkt', () => {
    expect(parseDecimal('1.50')).toBe(1.5);
    expect(parseDecimal('12.99')).toBe(12.99);
  });

  it('parst Ganzzahlen', () => {
    expect(parseDecimal('1000')).toBe(1000);
    expect(parseDecimal('0')).toBe(0);
  });

  it('versteht deutsches Format mit Tausender- und Dezimaltrennzeichen', () => {
    expect(parseDecimal('1.234,56')).toBe(1234.56);
    expect(parseDecimal('1.000.000,00')).toBe(1000000);
  });

  it('versteht englisches Format mit Tausender- und Dezimaltrennzeichen', () => {
    expect(parseDecimal('1,234.56')).toBe(1234.56);
    expect(parseDecimal('1,000,000.00')).toBe(1000000);
  });

  it('behandelt mehrere Kommas/Punkte als Tausendertrennzeichen', () => {
    expect(parseDecimal('1,000,000')).toBe(1000000);
    expect(parseDecimal('1.000.000')).toBe(1000000);
  });

  it('liefert NaN für leere oder ungültige Werte', () => {
    expect(parseDecimal('')).toBeNaN();
    expect(parseDecimal('   ')).toBeNaN();
    expect(parseDecimal('abc')).toBeNaN();
  });

  it('Round-Trip: ein per parseFloat zerstörter Wert bleibt jetzt erhalten', () => {
    expect(parseFloat('1,50')).toBe(1);
    expect(parseDecimal('1,50')).toBe(1.5);
  });
});
