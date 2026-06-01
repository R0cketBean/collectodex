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

/**
 * Repariert eine einzelne Kategorie aus einem Backup, statt sie bei
 * kleinen Mängeln komplett abzulehnen. Liefert `null`, wenn der Eintrag
 * unrettbar ist (kein Objekt oder ohne id) — solche Einträge werden beim
 * Import übersprungen.
 *
 * Hintergrund: Echte, über Monate gewachsene Sammlungen enthalten teils
 * unvollständige Kategorien (z. B. eine ohne `attributes`-Array, weil sie
 * früher unvollständig angelegt wurde). Eine zu strenge Validierung würde
 * die eigene Sicherung des Nutzers ablehnen — das Backup muss aber gerade
 * solche Daten wiederherstellen können.
 */
const coerceCategory = (cat: unknown): Category | null => {
  if (!isObject(cat) || typeof cat.id !== 'string') return null;
  return {
    ...(cat as Record<string, unknown>),
    id: cat.id,
    name: typeof cat.name === 'string' ? cat.name : 'Unbenannte Kategorie',
    attributes: Array.isArray(cat.attributes) ? cat.attributes : [],
    order: typeof cat.order === 'number' ? cat.order : 0,
  } as Category;
};

const coerceItem = (item: unknown): CollectionItem | null => {
  if (!isObject(item) || typeof item.id !== 'string') return null;
  if (typeof item.categoryId !== 'string') return null;
  return {
    ...(item as Record<string, unknown>),
    id: item.id,
    categoryId: item.categoryId,
    values: isObject(item.values) ? item.values : {},
  } as CollectionItem;
};

/**
 * Prüft eine geparste JSON-Struktur und liefert die enthaltenen
 * Sammlungsdaten zurück. Akzeptiert sowohl die neue versionierte Hülle
 * als auch das alte bare `{ categories, items }`-Format (frühere
 * Exporte).
 *
 * Philosophie: Abgelehnt wird nur, wenn die **Grundstruktur** fehlt (kein
 * Objekt, keine categories/items-Arrays) — das fängt versehentlich
 * gewählte fremde Dateien ab. Einzelne unvollständige Kategorien/Items
 * werden dagegen repariert (fehlende Felder aufgefüllt) bzw. übersprungen,
 * damit die eigene, ggf. über die Zeit "verbeulte" Sicherung des Nutzers
 * importierbar bleibt.
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

  const coercedCategories = categories
    .map(coerceCategory)
    .filter((c): c is Category => c !== null);
  const coercedItems = items
    .map(coerceItem)
    .filter((i): i is CollectionItem => i !== null);

  return {
    ok: true,
    data: {
      categories: coercedCategories,
      items: coercedItems,
    },
  };
};
