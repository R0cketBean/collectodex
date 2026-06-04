// Reine, testbare Kennzahlen für die Statistik-Seite (#92).
//
// Bewusst ohne React/Storage-Abhängigkeiten, damit die Rechenlogik isoliert
// getestet werden kann.

const MS_PER_DAY = 86_400_000;

/**
 * Haltedauer in Tagen seit dem Kaufdatum ("Gekauft am" / addedDate,
 * Format YYYY-MM-DD). Liefert null bei fehlendem/ungültigem Datum, 0 bei
 * einem in der Zukunft liegenden Datum.
 */
export const holdingDays = (
  addedDate: string | null | undefined,
  now: Date = new Date()
): number | null => {
  if (!addedDate) return null;
  const start = new Date(`${addedDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const diff = now.getTime() - start.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / MS_PER_DAY);
};

/** Gesamtrendite (ROI) als Bruch: (Wert - Kosten) / Kosten. null bei Kosten<=0. */
export const roi = (cost: number, value: number): number | null => {
  if (!Number.isFinite(cost) || cost <= 0) return null;
  return (value - cost) / cost;
};

/**
 * Annualisierte Rendite (Rendite p.a.) als Bruch. Erst ab >= minDays sinnvoll,
 * weil kurze Haltedauern beim Hochrechnen absurde Werte erzeugen. null, wenn
 * Kosten/Wert/Tage ungültig oder Haltedauer zu kurz.
 */
export const annualizedReturn = (
  cost: number,
  value: number,
  days: number | null,
  minDays = 30
): number | null => {
  if (!Number.isFinite(cost) || cost <= 0) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  if (days == null || days < minDays) return null;
  const years = days / 365;
  return Math.pow(value / cost, 1 / years) - 1;
};

/** Ganzzahliger Durchschnitt der vorhandenen Haltedauern; null wenn keine. */
export const averageHoldingDays = (
  daysList: (number | null)[]
): number | null => {
  const valid = daysList.filter((d): d is number => d != null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
};

/** Tage menschenlesbar (z.B. "1 J 45 T", "87 T"). */
export const formatHoldingDuration = (days: number | null): string => {
  if (days == null) return '—';
  if (days < 365) return `${days} T`;
  const years = Math.floor(days / 365);
  const rest = days % 365;
  return rest > 0 ? `${years} J ${rest} T` : `${years} J`;
};

/** Prozent-Anzeige aus einem Bruch (z.B. 0.1234 -> "+12,3 %"). */
export const formatPercent = (fraction: number | null, digits = 1): string => {
  if (fraction == null || !Number.isFinite(fraction)) return '—';
  const pct = fraction * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(digits).replace('.', ',')} %`;
};
