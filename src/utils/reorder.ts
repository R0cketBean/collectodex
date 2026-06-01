// Reine Helfer für das Umsortieren von Listen mit `order`-Feld.
//
// Hintergrund (#29): Das frühere Sortieren tauschte nur die order-WERTE
// zweier Elemente. Waren die order-Werte vorher kaputt (Duplikate/Lücken
// aus alten Operationen), sprang die Reihenfolge an "zufällige" Stellen.
// Diese Helfer arbeiten rein über Array-Positionen und nummerieren
// danach lückenlos neu — robust unabhängig vom Ausgangszustand.

export interface HasOrder {
  order: number;
}

/**
 * Sortiert eine Kopie der Liste nach `order` (stabile, vorhersehbare
 * Anzeige-Reihenfolge).
 */
export const sortByOrder = <T extends HasOrder>(list: T[]): T[] =>
  [...list].sort((a, b) => a.order - b.order);

/**
 * Verschiebt das Element an `index` einen Schritt nach oben/unten.
 * Liefert `null`, wenn die Bewegung am Rand nicht möglich ist
 * (oberstes Element nach oben / unterstes nach unten).
 */
export const moveInArray = <T>(
  arr: T[],
  index: number,
  direction: 'up' | 'down'
): T[] | null => {
  const newIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || index >= arr.length) return null;
  if (newIndex < 0 || newIndex >= arr.length) return null;
  const copy = [...arr];
  const [moved] = copy.splice(index, 1);
  copy.splice(newIndex, 0, moved);
  return copy;
};

/**
 * Nimmt eine `order`-behaftete Liste, verschiebt das Element mit `id`
 * um einen Schritt und gibt eine neue Liste zurück, in der `order`
 * lückenlos (0,1,2,…) der neuen Reihenfolge entspricht. Mutiert die
 * Eingabe nicht. Liefert `null`, wenn nichts zu tun ist (id unbekannt
 * oder Bewegung am Rand).
 */
export const moveAndRenumber = <T extends HasOrder & { id: string }>(
  list: T[],
  id: string,
  direction: 'up' | 'down'
): T[] | null => {
  const sorted = sortByOrder(list);
  const index = sorted.findIndex((el) => el.id === id);
  if (index === -1) return null;

  const moved = moveInArray(sorted, index, direction);
  if (!moved) return null;

  return moved.map((el, i) => ({ ...el, order: i }));
};
