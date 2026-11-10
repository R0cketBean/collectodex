// Items-Domäne, herausgelöst aus dem CollectionContext (#18).
// Besitzt den items-State samt Speicherung, Item-CRUD sowie Bilder und Links.
//
// Speicherweg (#123): Es gibt genau EINEN. Jede Änderung ist ein funktionales
// State-Update; ein Effekt schreibt die Liste danach entprellt als Ganzes in
// den Speicher. Frühere Sonderwege (direktes Lesen-Ändern-Schreiben einzelner
// Einträge im Speicher, Sperr-Flag, nachträgliche Verifizierung) sind
// entfallen – sie waren die Quelle von Wettläufen zwischen State und Speicher.
// Seit die Bilder als Dateien liegen (#120), ist die Liste klein genug dafür.

import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { CatalogRef, CollectionItem } from '../types/models';
import { normalizeLinkUrl } from '../utils/itemLinks';
import * as StorageService from '../services/StorageService';

/** Wartezeit, in der mehrere Änderungen zu einem Schreibvorgang zusammenfallen. */
export const SAVE_DEBOUNCE_MS = 300;

export interface ItemsApi {
  items: CollectionItem[];
  setItems: React.Dispatch<React.SetStateAction<CollectionItem[]>>;
  addItem: (
    categoryId: string,
    values: { [key: string]: any },
    options?: {
      links?: { [attributeId: string]: string };
      images?: { [attributeId: string]: string };
      catalog?: CatalogRef;
    }
  ) => string;
  updateItem: (id: string, values: { [key: string]: any }) => void;
  markValueChecked: (id: string) => void;
  updateMultipleItems: (ids: string[], values: { [key: string]: any }) => void;
  deleteItem: (id: string) => void;
  deleteMultipleItems: (ids: string[]) => void;
  getItemsByCategoryId: (categoryId: string) => CollectionItem[];
  deleteItemsByCategory: (categoryId: string) => void;
  addImageToItem: (itemId: string, attributeId: string, imageData: string) => void;
  removeImageFromItem: (itemId: string, attributeId: string) => void;
  addLinkToItem: (itemId: string, attributeId: string, url: string) => void;
  removeLinkFromItem: (itemId: string, attributeId: string) => void;
  /** Verknüpft Einträge mit Katalogkarten bzw. löst die Verknüpfung (`null`). */
  setItemCatalogRefs: (refs: Record<string, CatalogRef | null>) => void;
}

/** Entfernt einen Schlüssel; liefert `undefined`, wenn nichts übrig bleibt. */
const without = (map: Record<string, string> | undefined, key: string) => {
  if (!map || !(key in map)) return map;
  const rest = { ...map };
  delete rest[key];
  return Object.keys(rest).length > 0 ? rest : undefined;
};

export function useItems(): ItemsApi {
  const [items, setItems] = useState<CollectionItem[]>([]);

  // --- Speicherung ----------------------------------------------------------
  const latestItems = useRef(items);
  latestItems.current = items;
  const pendingSave = useRef<number | null>(null);
  // Schutz vor Datenverlust: Eine leere Liste wird nur gespeichert, wenn in
  // diesem Lauf schon einmal Einträge da waren (der Nutzer also wirklich alles
  // gelöscht hat). Kommt die Liste leer aus dem Speicher – auch wegen eines
  // Lesefehlers –, wird nichts überschrieben.
  const hadItems = useRef(false);

  const flush = useRef(() => {
    if (pendingSave.current === null) return;
    window.clearTimeout(pendingSave.current);
    pendingSave.current = null;
    StorageService.setData(StorageService.STORAGE_KEYS.ITEMS, latestItems.current).catch((error) =>
      console.error('Fehler beim Speichern der Items:', error)
    );
  }).current;

  useEffect(() => {
    if (items.length > 0) hadItems.current = true;
    if (!hadItems.current) return;
    if (pendingSave.current !== null) window.clearTimeout(pendingSave.current);
    pendingSave.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [items, flush]);

  // Beim Schließen oder Verstecken des Fensters sofort schreiben, damit die
  // letzte Änderung nicht in der Wartezeit verloren geht.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  // --- Änderungen -----------------------------------------------------------
  const patchItem = (id: string, patch: (item: CollectionItem) => CollectionItem) =>
    setItems((prev) => prev.map((item) => (item.id === id ? { ...patch(item), updatedAt: new Date() } : item)));

  const addItem: ItemsApi['addItem'] = (categoryId, values, options) => {
    const id = `item_${uuidv4()}`;
    const newItem: CollectionItem = {
      id,
      categoryId,
      values,
      // Aus dem Katalog übernommene Einträge starten mit einem Richtwert und gelten noch nicht als geprüft.
      ...('currentValue' in values && !options?.catalog ? { valueCheckedAt: new Date().toISOString() } : {}),
      ...(options?.links && Object.keys(options.links).length > 0 ? { links: options.links } : {}),
      ...(options?.images && Object.keys(options.images).length > 0 ? { images: options.images } : {}),
      ...(options?.catalog ? { catalog: options.catalog } : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setItems((prev) => [...prev, newItem]);
    return id;
  };

  // Ändert sich der aktuelle Wert, gilt der Preis als frisch geprüft (#125).
  const withValues = (item: CollectionItem, values: { [key: string]: any }): CollectionItem => ({
    ...item,
    values: { ...item.values, ...values },
    ...('currentValue' in values && values.currentValue !== item.values?.currentValue
      ? { valueCheckedAt: new Date().toISOString() }
      : {}),
  });

  const updateItem = (id: string, values: { [key: string]: any }) =>
    patchItem(id, (item) => withValues(item, values));

  /** Bestätigt den aktuellen Wert als geprüft, ohne ihn zu ändern. */
  const markValueChecked = (id: string) =>
    patchItem(id, (item) => ({ ...item, valueCheckedAt: new Date().toISOString() }));

  /**
   * Massenbearbeitung: setzt dieselben Attribut-Werte auf alle angegebenen
   * Items in EINEM State-Update. `values` enthält nur die zu ändernden
   * Attribute; übrige Werte je Item bleiben unangetastet.
   */
  const updateMultipleItems = (ids: string[], values: { [key: string]: any }) => {
    if (ids.length === 0 || Object.keys(values).length === 0) return;
    const idSet = new Set(ids);
    setItems((prev) =>
      prev.map((item) =>
        idSet.has(item.id) ? { ...withValues(item, values), updatedAt: new Date() } : item
      )
    );
  };

  const deleteItem = (id: string) => setItems((prev) => prev.filter((item) => item.id !== id));

  const deleteMultipleItems = (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setItems((prev) => prev.filter((item) => !idSet.has(item.id)));
  };

  const getItemsByCategoryId = (categoryId: string): CollectionItem[] =>
    items.filter((item) => item.categoryId === categoryId);

  // Kaskade aus deleteCategory: alle Items einer gelöschten Kategorie entfernen.
  const deleteItemsByCategory = (categoryId: string) =>
    setItems((prev) => prev.filter((item) => item.categoryId !== categoryId));

  const addImageToItem = (itemId: string, attributeId: string, imageData: string) =>
    patchItem(itemId, (item) => ({ ...item, images: { ...(item.images || {}), [attributeId]: imageData } }));

  const removeImageFromItem = (itemId: string, attributeId: string) =>
    patchItem(itemId, (item) => ({ ...item, images: without(item.images, attributeId) }));

  const removeLinkFromItem = (itemId: string, attributeId: string) =>
    patchItem(itemId, (item) => ({ ...item, links: without(item.links, attributeId) }));

  /** Setzt einen Link (getrimmt, mit Protokoll); eine leere URL entfernt ihn. */
  const addLinkToItem = (itemId: string, attributeId: string, url: string) => {
    const processedUrl = normalizeLinkUrl(url ?? '');
    if (processedUrl === '') return removeLinkFromItem(itemId, attributeId);
    patchItem(itemId, (item) => ({ ...item, links: { ...(item.links || {}), [attributeId]: processedUrl } }));
  };

  const setItemCatalogRefs = (refs: Record<string, CatalogRef | null>) => {
    if (Object.keys(refs).length === 0) return;
    setItems((prev) =>
      prev.map((item) => {
        if (!(item.id in refs)) return item;
        const { catalog: _old, ...rest } = item;
        const ref = refs[item.id];
        return { ...rest, ...(ref ? { catalog: ref } : {}), updatedAt: new Date() };
      })
    );
  };

  return {
    items,
    setItems,
    addItem,
    updateItem,
    markValueChecked,
    updateMultipleItems,
    deleteItem,
    deleteMultipleItems,
    getItemsByCategoryId,
    deleteItemsByCategory,
    addImageToItem,
    removeImageFromItem,
    addLinkToItem,
    removeLinkFromItem,
    setItemCatalogRefs,
  };
}
