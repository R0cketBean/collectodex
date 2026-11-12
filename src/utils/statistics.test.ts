import { describe, it, expect } from 'vitest';
import {
  holdingDays,
  roi,
  annualizedReturn,
  topPerformers,
  worstPerformers,
  averageHoldingDays,
  formatHoldingDuration,
  formatPercent,
} from './statistics';

describe('holdingDays', () => {
  const now = new Date('2026-06-04T12:00:00');
  it('zählt vergangene Tage', () => {
    expect(holdingDays('2026-06-01', now)).toBe(3);
    expect(holdingDays('2025-06-04', now)).toBe(365);
  });
  it('null bei fehlendem/ungültigem Datum', () => {
    expect(holdingDays(null, now)).toBeNull();
    expect(holdingDays(undefined, now)).toBeNull();
    expect(holdingDays('keinDatum', now)).toBeNull();
  });
  it('0 bei Datum in der Zukunft', () => {
    expect(holdingDays('2026-07-01', now)).toBe(0);
  });
});

describe('roi', () => {
  it('berechnet Gesamtrendite', () => {
    expect(roi(100, 150)).toBeCloseTo(0.5);
    expect(roi(100, 80)).toBeCloseTo(-0.2);
  });
  it('null bei Kosten <= 0', () => {
    expect(roi(0, 50)).toBeNull();
    expect(roi(-10, 50)).toBeNull();
  });
});

describe('annualizedReturn', () => {
  it('annualisiert über ein Jahr ~ Gesamtrendite', () => {
    const r = annualizedReturn(100, 150, 365);
    expect(r).toBeCloseTo(0.5, 5);
  });
  it('rechnet über zwei Jahre auf ein Jahr herunter', () => {
    expect(annualizedReturn(100, 144, 730)).toBeCloseTo(0.2, 5);
  });
  it('rechnet unter einem Jahr Haltedauer nicht hoch', () => {
    expect(annualizedReturn(100, 150, 45)).toBeNull();
    expect(annualizedReturn(100, 150, 364)).toBeNull();
  });
  it('null bei ungültigen Kosten/Wert', () => {
    expect(annualizedReturn(0, 150, 365)).toBeNull();
    expect(annualizedReturn(100, 0, 365)).toBeNull();
  });
});

describe('averageHoldingDays', () => {
  it('mittelt vorhandene Werte und ignoriert null', () => {
    expect(averageHoldingDays([10, 20, null, 30])).toBe(20);
  });
  it('null wenn keine gültigen Werte', () => {
    expect(averageHoldingDays([null, null])).toBeNull();
  });
});

describe('formatHoldingDuration', () => {
  it('Tage und Jahre', () => {
    expect(formatHoldingDuration(45)).toBe('45 T');
    expect(formatHoldingDuration(365)).toBe('1 J');
    expect(formatHoldingDuration(410)).toBe('1 J 45 T');
    expect(formatHoldingDuration(null)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('formatiert mit Vorzeichen und Komma', () => {
    expect(formatPercent(0.123)).toBe('+12,3 %');
    expect(formatPercent(-0.2)).toBe('-20,0 %');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('Ranglisten', () => {
  const stats = [0.5, -0.2, 2, null, 0, 0.1, -0.6].map((roiFrac, i) => ({ id: i, roiFrac }));
  it('führen nur Gewinner bzw. nur Verlierer, begrenzt auf die Anzahl', () => {
    expect(topPerformers(stats, 2).map((s) => s.roiFrac)).toEqual([2, 0.5]);
    expect(worstPerformers(stats).map((s) => s.roiFrac)).toEqual([-0.6, -0.2]);
  });
  it('bleiben leer, wenn nichts im Plus bzw. im Minus liegt', () => {
    expect(worstPerformers([{ roiFrac: 0.3 }, { roiFrac: 1 }])).toEqual([]);
    expect(topPerformers([{ roiFrac: -0.3 }])).toEqual([]);
  });
});
