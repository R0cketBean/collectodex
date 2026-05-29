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
