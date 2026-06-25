// Parser für eingefügte Datumswerte (#: Copy-Paste bei Datumsfeldern).
//
// <input type="date"> akzeptiert nur das ISO-Format YYYY-MM-DD und unterstützt
// kein direktes Einfügen z.B. von "25.06.2026". Diese Funktion wandelt gängige
// Eingaben in das ISO-Format um, damit der Wert per Paste übernommen werden kann
// (zusätzlich zur normalen Auswahl/Eingabe).

const pad = (n: number): string => String(n).padStart(2, '0');

const toISO = (year: number, month: number, day: number): string | null => {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Echte Gültigkeit prüfen (z.B. 31.02. ablehnen).
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
};

/**
 * Wandelt einen eingefügten Datums-String in das ISO-Format YYYY-MM-DD um.
 * Unterstützt:
 * - ISO mit -, / oder . als Trenner und führender vierstelliger Jahreszahl
 *   (z.B. "2026-06-25", "2026/6/5")
 * - Tag-zuerst mit -, / oder . und vierstelliger Jahreszahl am Ende
 *   (z.B. "25.06.2026", "5.6.2026", "25/06/2026")
 * Liefert null, wenn nichts Sinnvolles erkannt wird (dann bleibt das normale
 * Eingabeverhalten unberührt).
 */
export const parseDateInput = (input: string | null | undefined): string | null => {
  const s = (input || '').trim();
  if (!s) return null;

  // Jahr zuerst (ISO-ähnlich): YYYY[sep]M[sep]D
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return toISO(Number(m[1]), Number(m[2]), Number(m[3]));

  // Tag zuerst: D[sep]M[sep]YYYY
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return toISO(Number(m[3]), Number(m[2]), Number(m[1]));

  return null;
};
