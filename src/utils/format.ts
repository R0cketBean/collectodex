// Einheitliche Zahlen- und Betragsformate (#127): überall deutsches Format
// (1.522,00 €) statt verstreuter toFixed(2)-Aufrufe.

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const eurWhole = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Betrag in Euro, z. B. „1.522,00 €“; „–“ für fehlende Werte. */
export const formatEur = (v: number | null | undefined) => (isNumber(v) ? eur.format(v) : '–');

/** Betrag mit Vorzeichen, z. B. „+481,60 €“ / „-25,00 €“. */
export const formatSignedEur = (v: number | null | undefined) =>
  isNumber(v) ? `${v > 0 ? '+' : ''}${eur.format(v)}` : '–';

/** Gerundeter Betrag für Achsenbeschriftungen, z. B. „1.600 €“. */
export const formatEurWhole = (v: number | null | undefined) => (isNumber(v) ? eurWhole.format(v) : '–');

/** Zahl mit zwei Nachkommastellen, z. B. „1.234,50“. */
export const formatDecimal = (v: number) => decimal.format(v);

/** Ganze Zahl mit Tausenderpunkt, z. B. „1.234“. */
export const formatInteger = (v: number) => integer.format(Math.round(v));

/** Ob ein Attribut einen Geldbetrag enthält (Preis, Wert, Kosten, Gewinn/Verlust). */
export const isMoneyAttribute = (attributeId: string) =>
  /price|value|cost/i.test(attributeId) || attributeId === 'profitLoss';

/** Zahlenwert eines Attributs für Listen und Summen. */
export const formatAttributeNumber = (attributeId: string, value: number) =>
  isMoneyAttribute(attributeId)
    ? formatEur(value)
    : attributeId === 'quantity'
      ? formatInteger(value)
      : formatDecimal(value);
