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
 * Ab dieser Haltedauer wird eine Rendite pro Jahr ausgewiesen (#132). Darunter
 * wäre sie eine Hochrechnung: Aus +50 % in sechs Wochen würden über 3.000 % p.a.
 */
export const MIN_ANNUALIZE_DAYS = 365;

/**
 * Annualisierte Rendite (Rendite p.a.) als Bruch. null, wenn Kosten/Wert/Tage
 * ungültig sind oder die Haltedauer unter minDays liegt – dann zählt nur die
 * einfache Rendite.
 */
export const annualizedReturn = (
  cost: number,
  value: number,
  days: number | null,
  minDays = MIN_ANNUALIZE_DAYS
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

export interface Ranked {
  roiFrac: number | null;
}

/** Die besten Einträge mit Gewinn, höchste Rendite zuerst. */
export const topPerformers = <T extends Ranked>(stats: T[], limit = 5): T[] =>
  stats
    .filter((s): s is T & { roiFrac: number } => s.roiFrac != null && s.roiFrac > 0)
    .sort((a, b) => b.roiFrac - a.roiFrac)
    .slice(0, limit);

/** Die Einträge mit Verlust, größter Verlust zuerst. Gewinner tauchen hier nie auf. */
export const worstPerformers = <T extends Ranked>(stats: T[], limit = 5): T[] =>
  stats
    .filter((s): s is T & { roiFrac: number } => s.roiFrac != null && s.roiFrac < 0)
    .sort((a, b) => a.roiFrac - b.roiFrac)
    .slice(0, limit);

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
