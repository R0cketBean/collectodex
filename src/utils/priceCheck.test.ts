import { describe, expect, it } from 'vitest';
import type { CollectionItem } from '../types/models';
import { daysSinceCheck, deviationPercent, formatCheckAge, isDue, sortByCheckAge } from './priceCheck';

const now = new Date('2026-11-10T12:00:00Z');
const item = (id: string, checked: string | undefined, currentValue = 1): CollectionItem =>
  ({
    id,
    categoryId: 'singles',
    values: { currentValue },
    valueCheckedAt: checked,
    createdAt: now,
    updatedAt: now,
  }) as CollectionItem;

describe('daysSinceCheck / isDue', () => {
  it('zählt volle Tage und kennt „nie geprüft“', () => {
    expect(daysSinceCheck(item('a', '2026-11-10T08:00:00Z'), now)).toBe(0);
    expect(daysSinceCheck(item('a', '2026-10-01T12:00:00Z'), now)).toBe(40);
    expect(daysSinceCheck(item('a', undefined), now)).toBeNull();
    expect(daysSinceCheck(item('a', 'kaputt'), now)).toBeNull();
  });

  it('ist fällig, wenn nie geprüft oder älter als die Frist', () => {
    expect(isDue(item('a', undefined), 30, now)).toBe(true);
    expect(isDue(item('a', '2026-10-01T12:00:00Z'), 30, now)).toBe(true);
    expect(isDue(item('a', '2026-11-01T12:00:00Z'), 30, now)).toBe(false);
  });
});

describe('sortByCheckAge', () => {
  it('stellt nie geprüfte voran, dann die ältesten; bei Gleichstand den höheren Wert', () => {
    const sorted = sortByCheckAge(
      [
        item('frisch', '2026-11-09T12:00:00Z'),
        item('nie-klein', undefined, 2),
        item('alt', '2026-08-01T12:00:00Z'),
        item('nie-gross', undefined, 300),
      ],
      now
    );
    expect(sorted.map((i) => i.id)).toEqual(['nie-gross', 'nie-klein', 'alt', 'frisch']);
  });
});

describe('deviationPercent', () => {
  it('rechnet die Abweichung des Katalogpreises vom eigenen Wert', () => {
    expect(deviationPercent(100, 125)).toBe(25);
    expect(deviationPercent(100, 80)).toBe(-20);
    expect(deviationPercent(0, 80)).toBeNull();
    expect(deviationPercent(100, null)).toBeNull();
  });
});

describe('formatCheckAge', () => {
  it('formuliert das Alter', () => {
    expect([null, 0, 1, 34].map(formatCheckAge)).toEqual(['nie geprüft', 'heute', 'gestern', 'vor 34 Tagen']);
  });
});
