import { describe, expect, it } from 'vitest';
import { MAX_VALUE_POINTS, recordValue, trailChange } from './valueTrail';

const now = new Date(2026, 10, 12, 15, 0);
const base = { values: { currentValue: 10 }, createdAt: new Date(2026, 0, 5) };

describe('recordValue', () => {
  it('nimmt beim ersten Mal den bisherigen Wert als Ausgangspunkt mit', () => {
    expect(recordValue({ ...base, valueCheckedAt: new Date(2026, 5, 1, 9).toISOString() }, 25, now)).toEqual([
      { date: '2026-06-01', value: 10 },
      { date: '2026-11-12', value: 25 },
    ]);
  });

  it('datiert den Ausgangspunkt ohne Prüfdatum auf das Anlegen', () => {
    expect(recordValue(base, 25, now)?.[0]).toEqual({ date: '2026-01-05', value: 10 });
  });

  it('beginnt ohne bisherigen Wert oder bei gleichem Tag mit einem einzelnen Punkt', () => {
    expect(recordValue({ values: {}, createdAt: new Date(2026, 0, 5) }, 25, now)).toEqual([
      { date: '2026-11-12', value: 25 },
    ]);
    expect(recordValue({ ...base, createdAt: now }, 25, now)).toEqual([{ date: '2026-11-12', value: 25 }]);
  });

  it('behält pro Tag nur den letzten Stand', () => {
    const trail = [
      { date: '2026-11-01', value: 10 },
      { date: '2026-11-12', value: 20 },
    ];
    expect(recordValue({ ...base, valueTrail: trail }, 30, now)).toEqual([
      { date: '2026-11-01', value: 10 },
      { date: '2026-11-12', value: 30 },
    ]);
  });

  it('lässt den Verlauf bei einem ungültigen Wert unverändert und begrenzt seine Länge', () => {
    const trail = [{ date: '2026-11-01', value: 10 }];
    expect(recordValue({ ...base, valueTrail: trail }, '', now)).toBe(trail);
    const long = Array.from({ length: MAX_VALUE_POINTS }, (_, i) => ({
      date: `2025-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
      value: i,
    }));
    const next = recordValue({ ...base, valueTrail: long }, 999, now)!;
    expect(next).toHaveLength(MAX_VALUE_POINTS);
    expect(next[next.length - 1]).toEqual({ date: '2026-11-12', value: 999 });
    expect(next[0].value).toBe(1);
  });
});

describe('trailChange', () => {
  it('rechnet vom ersten zum letzten Punkt', () => {
    expect(trailChange([{ date: 'a', value: 10 }, { date: 'b', value: 30 }, { date: 'c', value: 15 }])).toBeCloseTo(0.5);
    expect(trailChange([{ date: 'a', value: 10 }])).toBeNull();
    expect(trailChange([{ date: 'a', value: 0 }, { date: 'b', value: 5 }])).toBeNull();
  });
});
