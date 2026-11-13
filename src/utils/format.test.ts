import { describe, expect, it } from 'vitest';
import {
  formatAttributeNumber,
  formatBytes,
  formatDecimal,
  formatEur,
  formatEurWhole,
  formatInteger,
  formatSignedEur,
  isMoneyAttribute,
} from './format';

// Intl setzt zwischen Zahl und € ein geschütztes Leerzeichen.
const plain = (s: string) => s.replace(/\u00a0/g, ' ');

describe('Betragsformate', () => {
  it('schreibt deutsch mit Tausenderpunkt und Komma', () => {
    expect(plain(formatEur(1522))).toBe('1.522,00 €');
    expect(plain(formatEur(0.5))).toBe('0,50 €');
    expect(formatEur(null)).toBe('–');
    expect(formatEur(Number.NaN)).toBe('–');
  });

  it('setzt bei Gewinnen ein Plus, bei null keins', () => {
    expect(plain(formatSignedEur(481.6))).toBe('+481,60 €');
    expect(plain(formatSignedEur(-25))).toBe('-25,00 €');
    expect(plain(formatSignedEur(0))).toBe('0,00 €');
  });

  it('rundet für Achsen auf ganze Euro', () => {
    expect(plain(formatEurWhole(1599.6))).toBe('1.600 €');
  });

  it('formatiert Zahlen ohne Währung', () => {
    expect(formatDecimal(1234.5)).toBe('1.234,50');
    expect(formatInteger(1234.4)).toBe('1.234');
  });

  it('schreibt Dateigrößen in Worten', () => {
    expect(formatBytes(0)).toBe('0 Byte');
    expect(formatBytes(512)).toBe('512 Byte');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3 MB');
    expect(formatBytes(70.25 * 1024 * 1024)).toBe('70,3 MB');
    expect(formatBytes(2.5 * 1024 ** 3)).toBe('2,5 GB');
  });
});

describe('Attributwerte', () => {
  it('erkennt Geldfelder am Namen', () => {
    expect(['purchasePrice', 'currentValue', 'totalCost', 'profitLoss'].every(isMoneyAttribute)).toBe(true);
    expect(isMoneyAttribute('quantity')).toBe(false);
    expect(isMoneyAttribute('grade')).toBe(false);
  });

  it('formatiert Geld, Anzahl und sonstige Zahlen passend', () => {
    expect(plain(formatAttributeNumber('totalValue', 1522))).toBe('1.522,00 €');
    expect(formatAttributeNumber('quantity', 3)).toBe('3');
    expect(formatAttributeNumber('grade', 9.5)).toBe('9,50');
  });
});
