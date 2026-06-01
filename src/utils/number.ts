// Zahlen-Parsing, das deutsches und englisches Format versteht.
//
// (Ursprünglich in utils/csv.ts beheimatet; beim Entfernen des CSV-
// Imports hierher umgezogen, da parseDecimal weiterhin von der
// Attribut-Typkonvertierung gebraucht wird — #44.)

/**
 * Parst eine Zahl aus Text und versteht dabei sowohl deutsches
 * (1.234,56 / 1,50) als auch englisches (1,234.56 / 1.50) Format.
 *
 * Hintergrund: `parseFloat("1,50")` liefert `1`, weil parseFloat am
 * Komma abbricht — aus 1,50 € wurde so stillschweigend 1 € (#31).
 *
 * Heuristik:
 * - Punkt UND Komma vorhanden: das *letzte* Zeichen ist das
 *   Dezimaltrennzeichen, das andere ein Tausendertrennzeichen.
 * - Nur Komma: ein einzelnes Komma ist ein Dezimaltrennzeichen
 *   (deutsches Format), mehrere Kommas sind Tausendertrennzeichen.
 * - Nur Punkt: ein einzelner Punkt ist ein Dezimaltrennzeichen
 *   (Standard), mehrere Punkte sind Tausendertrennzeichen.
 *
 * Liefert `NaN`, wenn der Wert keine gültige Zahl ist — der Aufrufer
 * entscheidet, wie damit umzugehen ist.
 */
export const parseDecimal = (raw: string): number => {
  const s = raw.trim();
  if (s === '') return NaN;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  let normalized = s;

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // deutsches Format: Punkte sind Tausender, Komma ist Dezimal
      normalized = s.replace(/\./g, '').replace(',', '.');
    } else {
      // englisches Format: Kommas sind Tausender, Punkt ist Dezimal
      normalized = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    const commaCount = (s.match(/,/g) || []).length;
    normalized =
      commaCount > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (hasDot) {
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1) normalized = s.replace(/\./g, '');
  }

  return Number(normalized);
};
