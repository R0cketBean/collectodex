// Ansicht einer Kategorie (#128): Tabelle oder Kacheln. Die Wahl wird je
// Kategorie gemerkt – Karten sieht man gern als Kacheln, Zubehör eher als Liste.

export type ItemViewMode = 'table' | 'tiles';

const STORAGE_KEY = 'collectodex-item-view';

const readAll = (): Record<string, ItemViewMode> => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw).filter((entry): entry is [string, ItemViewMode] => entry[1] === 'table' || entry[1] === 'tiles')
    );
  } catch {
    return {};
  }
};

/** Gemerkte Ansicht einer Kategorie; ohne Wahl die Tabelle. */
export const getItemViewMode = (categoryId: string | undefined): ItemViewMode =>
  (categoryId && readAll()[categoryId]) || 'table';

export const setItemViewMode = (categoryId: string, mode: ItemViewMode): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [categoryId]: mode }));
  } catch {
    // Ohne localStorage gilt die Wahl nur, solange die Seite offen ist.
  }
};
