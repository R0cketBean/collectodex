// Gemeinsamer Helper für die Link-Auflösung beim Export.
//
// Sowohl der Excel- als auch der CSV-Export müssen entscheiden, welcher
// Eintrag aus item.links zu welcher Spalte gehört. Der nicht offen-
// sichtliche Sonderfall: in der UI (CategoryItemsList.tsx) hat der
// dedizierte Cardmarket-Produkt-Link unter item.links.product Vorrang
// vor item.links.name in der Name-Spalte — neuere Items legen ihren Link
// nur dort ab, ältere noch unter 'name'. Wer das nicht spiegelt, lässt
// genau diese Items ohne Hyperlink durch den Export.

import type { AttributeDefinition, CollectionItem } from '../types/models';

/**
 * Liefert den Link, der zur Export-Zelle für `attr` gehört, oder
 * `undefined`, wenn das Item für diese Spalte keinen Link hat.
 *
 * Spezialregel für die Name-Spalte: `item.links.product` gewinnt gegen
 * `item.links.name`, weil so die UI es anzeigt.
 */
export const resolveItemLink = (
  item: CollectionItem,
  attr: AttributeDefinition
): string | undefined => {
  if (!item.links) return undefined;
  if (attr.id === 'name' && item.links.product) {
    return item.links.product;
  }
  return item.links[attr.id] || undefined;
};

/**
 * Normalisiert eine vom Nutzer eingegebene Link-URL: trimmt sie und ergänzt
 * das Protokoll (https://), falls es fehlt. Ein leerer/nur aus Leerzeichen
 * bestehender Wert ergibt einen leeren String (= kein Link).
 *
 * Diese Logik lag früher nur in addLinkToItem (useItems). Beim Anlegen eines
 * NEUEN Items werden die Links aber direkt an addItem übergeben (addLinkToItem
 * würde das noch nicht im Storage liegende Item nicht finden), deshalb muss die
 * Normalisierung zentral verfügbar sein, damit neu angelegte und nachträglich
 * bearbeitete Links identisch behandelt werden.
 */
export const normalizeLinkUrl = (url: string): string => {
  const trimmed = url.trim();
  if (trimmed === '') return '';
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return 'https://' + trimmed;
  }
  return trimmed;
};
