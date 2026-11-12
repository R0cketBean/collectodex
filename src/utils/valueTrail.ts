import type { CollectionItem, ValuePoint } from '../types/models';

// Wertverlauf eines Eintrags (#132). Jede Änderung des aktuellen Werts wird
// mit ihrem Tag festgehalten; pro Tag bleibt der letzte Stand. Daraus zeichnet
// der Eintragsdialog den Verlauf.

/** Mehr Punkte hält ein Eintrag nicht vor; die ältesten fallen weg. */
export const MAX_VALUE_POINTS = 120;

/** Lokales Datum als 'YYYY-MM-DD'. */
export const localDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const asValue = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Trägt den neuen Wert ein. Gibt es noch keinen Verlauf, wird der bisherige
 * Wert als Ausgangspunkt mit aufgenommen – datiert auf den Tag, an dem er
 * zuletzt gesetzt oder bestätigt wurde.
 */
export const recordValue = (
  item: Pick<CollectionItem, 'values' | 'valueTrail' | 'valueCheckedAt' | 'createdAt'>,
  nextValue: unknown,
  now: Date = new Date()
): ValuePoint[] | undefined => {
  const value = asValue(nextValue);
  if (value === null) return item.valueTrail;
  const today = localDateKey(now);
  let trail = item.valueTrail ?? [];

  if (trail.length === 0) {
    const previous = asValue(item.values?.currentValue);
    const since = item.valueCheckedAt ? new Date(item.valueCheckedAt) : new Date(item.createdAt);
    const sinceKey = Number.isNaN(since.getTime()) ? null : localDateKey(since);
    if (previous !== null && sinceKey && sinceKey < today) trail = [{ date: sinceKey, value: previous }];
  }

  return [...trail.filter((point) => point.date !== today), { date: today, value }]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_VALUE_POINTS);
};

/** Veränderung vom ersten zum letzten Punkt als Bruch; null ohne brauchbaren Ausgangswert. */
export const trailChange = (trail: ValuePoint[] | undefined): number | null => {
  if (!trail || trail.length < 2) return null;
  const first = trail[0].value;
  return first > 0 ? (trail[trail.length - 1].value - first) / first : null;
};
