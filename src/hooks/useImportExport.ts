// Import/Export- und Reset-Orchestrierung, herausgelöst aus dem
// CollectionContext (#14). Die reinen Bau-/Parse-Helfer leben bereits in
// services/excelExport.ts; hier liegt nur die Orchestrierung, die State und
// Storage zusammenbringt. Der Hook bekommt die benötigten State-Teile und
// Setter als Abhängigkeiten übergeben, damit der Context schlanker wird und
// Daten-State sauber von I/O getrennt ist.

import React from 'react';
import {
  Category,
  CollectionItem,
  CollectionSummary,
  DEFAULT_CATEGORIES,
} from '../types/models';
import { logger } from '../utils/logger';
import {
  buildCategoryExcel,
  buildCategoryExcelTemplate,
  buildCollectionExcel,
} from '../services/excelExport';
import * as StorageService from '../services/StorageService';

interface UseImportExportDeps {
  categories: Category[];
  items: CollectionItem[];
  summary: CollectionSummary;
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  setItems: React.Dispatch<React.SetStateAction<CollectionItem[]>>;
  getCategoryById: (id: string) => Category | undefined;
  getItemsByCategoryId: (categoryId: string) => CollectionItem[];
  calculateItemValue: (item: CollectionItem) => { [key: string]: any };
}

export interface ImportExportApi {
  exportData: () => { categories: Category[]; items: CollectionItem[] };
  importData: (data: { categories: Category[]; items: CollectionItem[] }) => void;
  resetToDefaults: () => void;
  exportCategoryAsExcel: (categoryId: string) => Promise<Blob | null>;
  createExcelTemplate: (categoryId: string) => Promise<Blob | null>;
  exportCollectionAsExcel: () => Promise<Blob | null>;
}

export function useImportExport(deps: UseImportExportDeps): ImportExportApi {
  const {
    categories,
    items,
    summary,
    setCategories,
    setItems,
    getCategoryById,
    getItemsByCategoryId,
    calculateItemValue,
  } = deps;

  const exportData = () => {
    // Optimiere den Export, indem wir die Daten in Batches verarbeiten
    // und unnötige temporäre Kopien vermeiden

    // Original categories ohne Änderungen zurückgeben
    // weil beim Import sowieso normalisiert wird
    return {
      categories,
      items,
    };
  };

  const importData = (data: { categories: Category[]; items: CollectionItem[] }) => {
    // Debug-Informationen
    logger.debug('Importing data:', data);

    // Batch-Verarbeitung für große Datenmengen
    const processBatch = (process: () => void) => {
      return new Promise<void>(resolve => {
        // Verarbeitung in einem separaten Task ausführen
        setTimeout(() => {
          process();
          resolve();
        }, 0);
      });
    };

    const importProcess = async () => {
      if (data.categories) {
        // Normalisiere Kategorien, um sicherzustellen, dass alle Datum-Objekte korrekt sind
        const normalizedCategories = data.categories.map(cat => {
          const normalized = { ...cat };

          // Normalisiere createdAt
          if (cat.createdAt instanceof Date) {
            normalized.createdAt = cat.createdAt;
          } else if (typeof cat.createdAt === 'string') {
            try {
              normalized.createdAt = new Date(cat.createdAt);
            } catch (e) {
              console.warn(`Ungültiges createdAt-Datum für Kategorie ${cat.id}:`, cat.createdAt);
              normalized.createdAt = new Date();
            }
          } else {
            normalized.createdAt = new Date();
          }

          // Normalisiere updatedAt
          if (cat.updatedAt instanceof Date) {
            normalized.updatedAt = cat.updatedAt;
          } else if (typeof cat.updatedAt === 'string') {
            try {
              normalized.updatedAt = new Date(cat.updatedAt);
            } catch (e) {
              console.warn(`Ungültiges updatedAt-Datum für Kategorie ${cat.id}:`, cat.updatedAt);
              normalized.updatedAt = new Date();
            }
          } else {
            normalized.updatedAt = new Date();
          }

          return normalized;
        });

        logger.debug('Normalized categories:', normalizedCategories);

        // Kategorien setzen
        await processBatch(() => setCategories(normalizedCategories));
      }

      if (!data.items || data.items.length === 0) {
        // Restore einer leeren Sammlung: vorhandene Items wirklich leeren,
        // sonst blieben beim Wiederherstellen alte Einträge zurück (#30).
        await processBatch(() => setItems([]));
        await StorageService.setData(StorageService.STORAGE_KEYS.ITEMS, []);
      } else {
        // Verarbeite Items in Batches, wenn es viele gibt
        const BATCH_SIZE = 100; // Anzahl der Items pro Batch

        // Alle Items normalisieren
        const allNormalizedItems = data.items.map(item => {
          // Erstelle eine vollständig normalisierte Version des Items
          const normalized = { ...item };

          // Normalisiere createdAt
          if (item.createdAt instanceof Date) {
            normalized.createdAt = item.createdAt;
          } else if (typeof item.createdAt === 'string') {
            try {
              normalized.createdAt = new Date(item.createdAt);
            } catch (e) {
              console.warn(`Ungültiges createdAt-Datum für Item ${item.id}:`, item.createdAt);
              normalized.createdAt = new Date();
            }
          } else {
            normalized.createdAt = new Date();
          }

          // Normalisiere updatedAt
          if (item.updatedAt instanceof Date) {
            normalized.updatedAt = item.updatedAt;
          } else if (typeof item.updatedAt === 'string') {
            try {
              normalized.updatedAt = new Date(item.updatedAt);
            } catch (e) {
              console.warn(`Ungültiges updatedAt-Datum für Item ${item.id}:`, item.updatedAt);
              normalized.updatedAt = new Date();
            }
          } else {
            normalized.updatedAt = new Date();
          }

          // Normalisiere auch Datumswerte innerhalb der values
          if (normalized.values) {
            Object.keys(normalized.values).forEach(key => {
              const value = normalized.values[key];
              // Prüfe ob der Wert ein Datum-String ist
              if (value && typeof value === 'string') {
                const valueStr = value as string;
                if (valueStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                  try {
                    normalized.values[key] = new Date(valueStr);
                  } catch (e) {
                    console.warn(`Konnte Datum nicht konvertieren: ${valueStr}`, e);
                  }
                }
              }
            });
          }

          return normalized;
        });

        // Wenn es zu viele Items gibt, verarbeite sie in Batches
        if (allNormalizedItems.length > BATCH_SIZE) {
          logger.debug(`Importing ${allNormalizedItems.length} items in batches of ${BATCH_SIZE}`);

          // Items in Batches verarbeiten
          const batches = Math.ceil(allNormalizedItems.length / BATCH_SIZE);

          for (let i = 0; i < batches; i++) {
            const start = i * BATCH_SIZE;
            const end = Math.min((i + 1) * BATCH_SIZE, allNormalizedItems.length);
            const batchItems = allNormalizedItems.slice(start, end);

            logger.debug(`Processing batch ${i + 1}/${batches} (items ${start + 1}-${end})`);

            // Batch verarbeiten und warten
            await processBatch(() => {
              if (i === 0) {
                // Erster Batch: Ersetze alle vorhandenen Items
                setItems(batchItems);
              } else {
                // Weitere Batches: Füge Items zum vorhandenen Array hinzu
                setItems(prevItems => [...prevItems, ...batchItems]);
              }
            });
          }
        } else {
          // Wenn wenige Items, verarbeite alle auf einmal
          logger.debug(`Importing ${allNormalizedItems.length} items at once`);
          await processBatch(() => setItems(allNormalizedItems));
        }

        // Speichere normalisierte Items sofort im Storage
        const itemsForStorage = allNormalizedItems.map(item => {
          const itemCopy: any = { ...item };

          // Konvertiere Date-Objekte zu Strings für Storage
          if (itemCopy.createdAt instanceof Date) {
            itemCopy.createdAt = itemCopy.createdAt.toISOString();
          }

          if (itemCopy.updatedAt instanceof Date) {
            itemCopy.updatedAt = itemCopy.updatedAt.toISOString();
          }

          return itemCopy;
        });

        await StorageService.setData(StorageService.STORAGE_KEYS.ITEMS, itemsForStorage);
      }
    };

    // Starte den Import-Prozess
    importProcess().catch(error => {
      console.error('Fehler beim Importieren der Daten:', error);
    });
  };

  const resetToDefaults = () => {
    // Standardkategorien mit Datum-Objekten
    const defaultCategoriesWithDates = DEFAULT_CATEGORIES.map(cat => ({
      ...cat,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    setCategories(defaultCategoriesWithDates);
    setItems([]);

    // Speichere die Standardwerte im Speicher
    StorageService.setData(StorageService.STORAGE_KEYS.CATEGORIES, defaultCategoriesWithDates);
    StorageService.setData(StorageService.STORAGE_KEYS.ITEMS, []);
  };

  // Excel-Funktionen
  const exportCategoryAsExcel = async (categoryId: string): Promise<Blob | null> => {
    const category = getCategoryById(categoryId);
    if (!category) return null;
    return buildCategoryExcel(
      category,
      getItemsByCategoryId(categoryId),
      calculateItemValue,
    );
  };

  const createExcelTemplate = async (categoryId: string): Promise<Blob | null> => {
    const category = getCategoryById(categoryId);
    if (!category) return null;
    return buildCategoryExcelTemplate(category);
  };

  const exportCollectionAsExcel = async (): Promise<Blob | null> => {
    return buildCollectionExcel(categories, items, summary, calculateItemValue);
  };

  return {
    exportData,
    importData,
    resetToDefaults,
    exportCategoryAsExcel,
    createExcelTemplate,
    exportCollectionAsExcel,
  };
}
