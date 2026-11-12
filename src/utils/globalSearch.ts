import type { Category, CollectionItem } from '../types/models';

// Globale Suche (#130): findet Einträge über alle Kategorien. Durchsucht werden
// der Name und alle Text- und Auswahlfelder (Erweiterung, Zustand, Sprache …).
// Mehrere Wörter müssen alle vorkommen, dürfen aber in verschiedenen Feldern
// stehen („glurak psa“).

/** Vereinheitlicht Schreibweisen: klein, ohne Akzente, ß wie ss („Pokemon“ findet „Pokémon“). */
export const normalizeSearch = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .trim();

interface IndexedField {
  label: string;
  value: string;
  text: string;
}

export interface SearchEntry {
  item: CollectionItem;
  category: Category;
  name: string;
  nameText: string;
  fields: IndexedField[];
  /** Name und alle Felder in einem Stück, für die schnelle Vorprüfung. */
  allText: string;
}

export interface SearchHit {
  item: CollectionItem;
  category: Category;
  name: string;
  /** Feld, in dem ein Suchwort gefunden wurde, das nicht im Namen steht. */
  matched?: { label: string; value: string };
}

export interface SearchResult {
  hits: SearchHit[];
  /** Anzahl aller Treffer, auch der nicht mehr gezeigten. */
  total: number;
}

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';

/** Bereitet die Einträge einmal für die Suche auf. Einträge ohne Kategorie fallen heraus. */
export const buildSearchIndex = (items: CollectionItem[], categories: Category[]): SearchEntry[] => {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const searchable = new Map(
    categories.map((category) => [
      category.id,
      category.attributes.filter((attr) => attr.id !== 'name' && (attr.type === 'text' || attr.type === 'dropdown')),
    ])
  );
  const entries: SearchEntry[] = [];
  for (const item of items) {
    const category = byId.get(item.categoryId);
    if (!category) continue;
    const name = asText(item.values?.name) || 'Unbenannt';
    const fields: IndexedField[] = [];
    for (const attr of searchable.get(category.id) ?? []) {
      const value = asText(item.values?.[attr.id]);
      if (value) fields.push({ label: attr.name, value, text: normalizeSearch(value) });
    }
    const nameText = normalizeSearch(name);
    entries.push({
      item,
      category,
      name,
      nameText,
      fields,
      allText: [nameText, ...fields.map((field) => field.text)].join('\n'),
    });
  }
  return entries;
};

// Rang eines Treffers: kleiner ist besser.
const rank = (entry: SearchEntry, query: string, tokens: string[]): number => {
  if (entry.nameText === query) return 0;
  if (entry.nameText.startsWith(query)) return 1;
  const inName = tokens.filter((token) => entry.nameText.includes(token)).length;
  if (inName === tokens.length) {
    const words = entry.nameText.split(/[^\p{L}\p{N}]+/u);
    return words.some((word) => word.startsWith(tokens[0])) ? 2 : 3;
  }
  return inName > 0 ? 4 : 5;
};

/** Sucht im Index. Die besten Treffer zuerst, bei Gleichstand nach Name. */
export const searchEntries = (index: SearchEntry[], rawQuery: string, limit = 50): SearchResult => {
  const query = normalizeSearch(rawQuery);
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { hits: [], total: 0 };

  const found: { entry: SearchEntry; rank: number }[] = [];
  for (const entry of index) {
    if (tokens.every((token) => entry.allText.includes(token))) {
      found.push({ entry, rank: rank(entry, query, tokens) });
    }
  }
  found.sort((a, b) => a.rank - b.rank || a.entry.name.localeCompare(b.entry.name, 'de', { numeric: true }));

  const hits = found.slice(0, limit).map(({ entry }): SearchHit => {
    const outside = tokens.find((token) => !entry.nameText.includes(token));
    const field = outside ? entry.fields.find((f) => f.text.includes(outside)) : undefined;
    return {
      item: entry.item,
      category: entry.category,
      name: entry.name,
      matched: field ? { label: field.label, value: field.value } : undefined,
    };
  });
  return { hits, total: found.length };
};
