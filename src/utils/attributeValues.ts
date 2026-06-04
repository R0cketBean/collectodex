// Hilfsfunktionen rund um Attribut-Werte von Items.
//
// Beim Ändern eines Attribut-Typs (z. B. Text → Zahl) müssen die bereits
// gespeicherten Item-Werte an den neuen Typ angepasst werden — sonst
// landet z. B. ein Text "abc" in einem nun als Zahl deklarierten Feld und
// verfälscht Anzeige, Sortierung und Formelauswertung (#28).

import { AttributeDataType } from '../types/models';
import { parseDecimal } from './number';

/**
 * Wandelt einen vorhandenen Item-Wert in den durch `type` geforderten
 * Datentyp um. Leere/fehlende Werte werden auf einen typgerechten
 * Standard gesetzt. Für `formula` wird `undefined` zurückgegeben, weil
 * berechnete Attribute keinen eigenen Wert speichern (der Aufrufer soll
 * den Schlüssel dann entfernen).
 */
export const coerceValueToType = (
  value: unknown,
  type: AttributeDataType,
  options?: string[]
): unknown => {
  if (type === 'formula') return undefined;

  const isEmpty =
    value === null || value === undefined || String(value).trim() === '';
  if (isEmpty) {
    if (type === 'number') return 0;
    if (type === 'boolean') return false;
    return null;
  }

  switch (type) {
    case 'number': {
      if (typeof value === 'number') return value;
      const n = parseDecimal(String(value));
      return Number.isNaN(n) ? 0 : n;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      const s = String(value).toLowerCase().trim();
      return s === 'true' || s === 'ja' || s === '1';
    }
    case 'date': {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    case 'dropdown': {
      const s = String(value);
      if (options && options.length > 0) {
        return options.includes(s) ? s : null;
      }
      return s;
    }
    case 'text':
    default:
      return String(value);
  }
};
