// Helfer für das Voll-Backup der Sammlung (JSON-Export/Import).
//
// Der Export verpackt die Daten in eine versionierte Hülle, damit
// künftige Formatänderungen migrierbar bleiben. Der Import validiert die
// Struktur, bevor sie in den State geschrieben wird — eine versehentlich
// gewählte fremde/kaputte Datei darf die bestehende Sammlung nicht
// beschädigen (#30).

import type { Category, CollectionItem } from '../types/models';

export const BACKUP_FORMAT_VERSION = 1;

/** Nutzdaten einer Sicherung. */
export interface BackupPayload {
  categories: Category[];
  items: CollectionItem[];
}

/** Versionierte Backup-Hülle, wie sie der Export erzeugt. */
export interface BackupEnvelope {
  app: 'CollectODex';
  version: number;
  exportedAt: string;
  data: BackupPayload;
}

/**
 * Verpackt die Sammlungsdaten in die versionierte Backup-Hülle.
 */
export const wrapBackup = (payload: BackupPayload): BackupEnvelope => ({
  app: 'CollectODex',
  version: BACKUP_FORMAT_VERSION,
  exportedAt: new Date().toISOString(),
  data: {
    categories: payload.categories,
    items: payload.items,
  },
});

export type ValidationResult =
  | { ok: true; data: BackupPayload }
  | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const validateCategory = (cat: unknown, index: number): string | null => {
  if (!isObject(cat)) return `Kategorie #${index + 1} ist kein Objekt`;
  if (typeof cat.id !== 'string') return `Kategorie #${index + 1} hat keine gültige id`;
  if (typeof cat.name !== 'string') return `Kategorie "${cat.id}" hat keinen Namen`;
  if (!Array.isArray(cat.attributes)) return `Kategorie "${cat.id}" hat kein attributes-Array`;
  return null;
};

const validateItem = (item: unknown, index: number): string | null => {
  if (!isObject(item)) return `Eintrag #${index + 1} ist kein Objekt`;
  if (typeof item.id !== 'string') return `Eintrag #${index + 1} hat keine gültige id`;
  if (typeof item.categoryId !== 'string') return `Eintrag "${item.id}" hat keine categoryId`;
  if (!isObject(item.values)) return `Eintrag "${item.id}" hat kein values-Objekt`;
  return null;
};

/**
 * Prüft eine geparste JSON-Struktur und liefert die enthaltenen
 * Sammlungsdaten zurück. Akzeptiert sowohl die neue versionierte Hülle
 * als auch das alte bare `{ categories, items }`-Format (frühere
 * Exporte), damit bestehende Sicherungen weiterhin importierbar sind.
 */
export const validateBackup = (parsed: unknown): ValidationResult => {
  if (!isObject(parsed)) {
    return { ok: false, error: 'Die Datei enthält kein gültiges JSON-Objekt.' };
  }

  // Neue Hülle erkennen (hat ein data-Feld) vs. altes bare Format.
  const payload: unknown =
    'data' in parsed && isObject((parsed as Record<string, unknown>).data)
      ? (parsed as Record<string, unknown>).data
      : parsed;

  if (!isObject(payload)) {
    return { ok: false, error: 'Die Backup-Struktur ist ungültig.' };
  }

  const { categories, items } = payload as Record<string, unknown>;

  if (!Array.isArray(categories)) {
    return { ok: false, error: 'Im Backup fehlt ein gültiges categories-Array.' };
  }
  if (!Array.isArray(items)) {
    return { ok: false, error: 'Im Backup fehlt ein gültiges items-Array.' };
  }

  for (let i = 0; i < categories.length; i++) {
    const err = validateCategory(categories[i], i);
    if (err) return { ok: false, error: `Ungültige Kategorie: ${err}` };
  }
  for (let i = 0; i < items.length; i++) {
    const err = validateItem(items[i], i);
    if (err) return { ok: false, error: `Ungültiger Eintrag: ${err}` };
  }

  return {
    ok: true,
    data: {
      categories: categories as Category[],
      items: items as CollectionItem[],
    },
  };
};
