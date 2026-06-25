import { describe, expect, it } from 'vitest';
import { parseDateInput } from './dateInput';

describe('parseDateInput', () => {
  it('liefert null für leere/ungültige Eingaben', () => {
    expect(parseDateInput('')).toBeNull();
    expect(parseDateInput('   ')).toBeNull();
    expect(parseDateInput(null)).toBeNull();
    expect(parseDateInput(undefined)).toBeNull();
    expect(parseDateInput('kein Datum')).toBeNull();
  });

  it('übernimmt ISO-Format unverändert', () => {
    expect(parseDateInput('2026-06-25')).toBe('2026-06-25');
  });

  it('füllt ein- und zweistellige Monate/Tage auf', () => {
    expect(parseDateInput('2026-6-5')).toBe('2026-06-05');
    expect(parseDateInput('2026/6/5')).toBe('2026-06-05');
  });

  it('versteht deutsches Tag-zuerst-Format', () => {
    expect(parseDateInput('25.06.2026')).toBe('2026-06-25');
    expect(parseDateInput('5.6.2026')).toBe('2026-06-05');
    expect(parseDateInput('25/06/2026')).toBe('2026-06-25');
    expect(parseDateInput('25-06-2026')).toBe('2026-06-25');
  });

  it('trimmt umgebende Leerzeichen', () => {
    expect(parseDateInput('  25.06.2026  ')).toBe('2026-06-25');
  });

  it('lehnt unmögliche Daten ab', () => {
    expect(parseDateInput('31.02.2026')).toBeNull();
    expect(parseDateInput('2026-13-01')).toBeNull();
    expect(parseDateInput('00.06.2026')).toBeNull();
  });
});
