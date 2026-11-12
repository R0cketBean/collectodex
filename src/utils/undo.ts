import type { CollectionItem } from '../types/models';

// Rückgängig für Löschen und Massenbearbeitung (#131). Vor der Änderung wird
// der alte Stand der betroffenen Einträge festgehalten; „Rückgängig“ spielt
// ihn in die dann aktuelle Liste zurück, ohne spätere Änderungen an anderen
// Einträgen anzutasten.

export interface RemovedItem {
  item: CollectionItem;
  /** Stelle in der Liste vor dem Löschen. */
  index: number;
}

/** Hält die Einträge fest, die gleich gelöscht werden, samt ihrer Stelle in der Liste. */
export const captureRemoved = (items: CollectionItem[], ids: string[]): RemovedItem[] => {
  const idSet = new Set(ids);
  const removed: RemovedItem[] = [];
  items.forEach((item, index) => {
    if (idSet.has(item.id)) removed.push({ item, index });
  });
  return removed;
};

/** Setzt gelöschte Einträge wieder an ihre alte Stelle. Schon vorhandene bleiben unberührt. */
export const restoreRemoved = (items: CollectionItem[], removed: RemovedItem[]): CollectionItem[] => {
  const present = new Set(items.map((item) => item.id));
  const missing = removed.filter(({ item }) => !present.has(item.id)).sort((a, b) => a.index - b.index);
  if (missing.length === 0) return items;
  const result = [...items];
  for (const { item, index } of missing) {
    result.splice(Math.min(index, result.length), 0, item);
  }
  return result;
};

/** Hält den Stand der Einträge fest, die gleich geändert werden. */
export const captureChanged = (items: CollectionItem[], ids: string[]): CollectionItem[] => {
  const idSet = new Set(ids);
  return items.filter((item) => idSet.has(item.id));
};

/** Stellt den festgehaltenen Stand wieder her. Inzwischen gelöschte Einträge bleiben gelöscht. */
export const restoreChanged = (items: CollectionItem[], before: CollectionItem[]): CollectionItem[] => {
  const byId = new Map(before.map((item) => [item.id, item]));
  return items.map((item) => byId.get(item.id) ?? item);
};
