import { describe, it, expect } from 'vitest';
import { coerceValueToType } from './attributeValues';

describe('coerceValueToType', () => {
  it('wandelt Text in Zahl (deutsches Komma via parseDecimal)', () => {
    expect(coerceValueToType('1,50', 'number')).toBe(1.5);
    expect(coerceValueToType('42', 'number')).toBe(42);
    expect(coerceValueToType(7, 'number')).toBe(7);
  });

  it('setzt ungültige Zahl auf 0', () => {
    expect(coerceValueToType('abc', 'number')).toBe(0);
  });

  it('wandelt Werte in Boolean', () => {
    expect(coerceValueToType('ja', 'boolean')).toBe(true);
    expect(coerceValueToType('true', 'boolean')).toBe(true);
    expect(coerceValueToType('1', 'boolean')).toBe(true);
    expect(coerceValueToType('nein', 'boolean')).toBe(false);
    expect(coerceValueToType(true, 'boolean')).toBe(true);
  });

  it('wandelt Werte in Text', () => {
    expect(coerceValueToType(123, 'text')).toBe('123');
    expect(coerceValueToType(true, 'text')).toBe('true');
  });

  it('wandelt gültige Daten in ISO, ungültige auf null', () => {
    expect(coerceValueToType('2024-01-15', 'date')).toContain('2024-01-15');
    expect(coerceValueToType('kein-datum', 'date')).toBeNull();
  });

  it('behält Dropdown-Werte nur, wenn sie in den Optionen sind', () => {
    expect(coerceValueToType('rot', 'dropdown', ['rot', 'blau'])).toBe('rot');
    expect(coerceValueToType('grün', 'dropdown', ['rot', 'blau'])).toBeNull();
    expect(coerceValueToType('beliebig', 'dropdown')).toBe('beliebig');
  });

  it('gibt für formula undefined zurück (kein eigener Wert)', () => {
    expect(coerceValueToType(99, 'formula')).toBeUndefined();
  });

  it('setzt leere Werte auf typgerechten Standard', () => {
    expect(coerceValueToType('', 'number')).toBe(0);
    expect(coerceValueToType(null, 'boolean')).toBe(false);
    expect(coerceValueToType(undefined, 'text')).toBeNull();
    expect(coerceValueToType('   ', 'date')).toBeNull();
  });
});
