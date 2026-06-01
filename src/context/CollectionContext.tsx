import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Category,
  CollectionItem,
  CollectionSummary,
  AttributeDefinition,
  DEFAULT_CATEGORIES
} from '../types/models';
import { logger } from '../utils/logger';
import { coerceValueToType } from '../utils/attributeValues';
import { evaluateFormula } from '../utils/formula';
import {
  parseCSVRow,
  splitCSVRows,
  buildCategoryCSV,
  buildCategoryTemplateCSV,
  parseDecimal,
} from '../utils/csv';
import {
  buildCategoryExcel,
  buildCategoryExcelTemplate,
  buildCollectionExcel,
} from '../services/excelExport';
import * as StorageService from '../services/StorageService';

// Typ für den Context
interface CollectionContextType {
  // Daten
  categories: Category[];
  items: CollectionItem[];
  summary: CollectionSummary;
  
  // Kategorie-Funktionen
  addCategory: (category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateCategory: (id: string, category: Partial<Omit<Category, 'id'>>) => void;
  deleteCategory: (id: string) => void;
  
  // Attribut-Funktionen
  addAttributeToCategory: (categoryId: string, attribute: Omit<AttributeDefinition, 'id'>) => string;
  updateAttribute: (categoryId: string, attributeId: string, attribute: Partial<AttributeDefinition>) => void;
  deleteAttribute: (categoryId: string, attributeId: string) => void;
  
  // Item-Funktionen
  addItem: (
    categoryId: string,
    values: { [key: string]: any },
    options?: {
      links?: { [attributeId: string]: string };
      images?: { [attributeId: string]: string };
    }
  ) => string;
  updateItem: (id: string, values: { [key: string]: any }) => void;
  deleteItem: (id: string) => void;
  deleteMultipleItems: (ids: string[]) => void;
  getItemsByCategoryId: (categoryId: string) => CollectionItem[];
  setItems: React.Dispatch<React.SetStateAction<CollectionItem[]>>;
  
  // Bilder und Links
  addImageToItem: (itemId: string, attributeId: string, imageData: string) => void;
  removeImageFromItem: (itemId: string, attributeId: string) => void;
  addLinkToItem: (itemId: string, attributeId: string, url: string) => void;
  removeLinkFromItem: (itemId: string, attributeId: string) => void;
  cleanupItemLinks: (itemId: string) => void;
  
  // Berechnung und Werte
  calculateItemValue: (item: CollectionItem) => { [key: string]: any };
  calculateFormula: (formula: string, values: { [key: string]: any }) => any;
  
  // Datenverwaltung
  exportData: () => { categories: Category[], items: CollectionItem[] };
  exportCategoryAsCSV: (categoryId: string) => { fileName: string, content: string } | null;
  createCategoryTemplate: (categoryId: string) => { fileName: string, content: string } | null;
  importCSV: (categoryId: string, csvContent: string) => { success: boolean, count: number, errors: string[], imageInfoRowCount: number };
  importData: (data: { categories: Category[], items: CollectionItem[] }) => void;
  resetToDefaults: () => void;
  
  // Excel-Funktionen
  exportCategoryAsExcel: (categoryId: string) => Promise<Blob | null>;
  createExcelTemplate: (categoryId: string) => Promise<Blob | null>;
  exportCollectionAsExcel: () => Promise<Blob | null>;
  
  // Fehlerkorrekturen
  correctItemCategories: (sourceIdOrItemId: string, targetId: string, isSingleItem?: boolean) => { success: boolean, correctedCount: number, error: string | null };
}

// Anfangswerte für den Context
const initialSummary: CollectionSummary = {
  totalItems: 0,
  totalValue: 0,
  totalCost: 0,
  profitLoss: 0,
  categorySummaries: {}
};

// Context erstellen
const CollectionContext = createContext<CollectionContextType | undefined>(undefined);

// Hook für den Zugriff auf den Context
export const useCollection = () => {
  const context = useContext(CollectionContext);
  if (!context) {
    throw new Error('useCollection must be used within a CollectionProvider');
  }
  return context;
};

// Props für den Provider
interface CollectionProviderProps {
  children: ReactNode;
}

// Globale Flags für die Synchronisation
const directUpdateInProgress = { value: false };

// Optimiertes Debounce-Setup für bessere Leistung
let saveDebounceTimer: number | null = null;
const saveDebounceDelay = 1000; // 1 Sekunde Verzögerung

// Provider-Komponente
export const CollectionProvider: React.FC<CollectionProviderProps> = ({ children }) => {
  // State für die Daten
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [summary, setSummary] = useState<CollectionSummary>(initialSummary);

  // Initialisiere Anwendung mit Standardkategorien, wenn keine vorhanden sind
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Lade Kategorien aus dem Speicher
        const storedCategories = await StorageService.getData<Category[]>(StorageService.STORAGE_KEYS.CATEGORIES);
        if (storedCategories) {
          // Konvertiere Datum-Strings zurück zu Date-Objekten
          const categoriesWithDates = storedCategories.map((cat: any) => ({
            ...cat,
            createdAt: new Date(cat.createdAt),
            updatedAt: new Date(cat.updatedAt)
          }));
          setCategories(categoriesWithDates);
        } else {
          // Wenn keine Kategorien vorhanden sind, initialisiere mit Standardkategorien
          const defaultCategoriesWithDates = DEFAULT_CATEGORIES.map(cat => ({
            ...cat,
            createdAt: new Date(),
            updatedAt: new Date()
          }));
          setCategories(defaultCategoriesWithDates);
          await StorageService.setData(StorageService.STORAGE_KEYS.CATEGORIES, defaultCategoriesWithDates);
        }
        
        // Lade Items aus dem Speicher
        const storedItems = await StorageService.getData<CollectionItem[]>(StorageService.STORAGE_KEYS.ITEMS);
        if (storedItems) {
          // Konvertiere Datum-Strings zurück zu Date-Objekten
          const itemsWithDates = storedItems.map((item: any) => ({
            ...item,
            createdAt: new Date(item.createdAt),
            updatedAt: new Date(item.updatedAt)
          }));
          setItems(itemsWithDates);
        }
      } catch (error) {
        console.error('Fehler beim Initialisieren der App:', error);
        // Bei Fehler mit Standardwerten initialisieren
        resetToDefaults();
      }
    };
    
    initializeApp();
  }, []);
  
  /**
   * Speichert alle Items im Storage
   * Optimiert mit besserer Fehlerbehandlung und Konfliktvermeidung
   */
  const saveItemsToStorage = useCallback(async () => {
    // Nicht speichern, wenn ein direktes Update läuft
    if (directUpdateInProgress.value) {
      logger.debug('Überspringe automatisches Speichern, da direktes Update läuft');
      return;
    }

    // Speichere nur, wenn Items vorhanden sind
    if (items.length === 0) {
      logger.debug('Keine Items zum Speichern vorhanden');
      return;
    }

    try {
      logger.debug('Saving items to storage:', items.length);
      await StorageService.setData(StorageService.STORAGE_KEYS.ITEMS, items);
    } catch (error) {
      console.error('Fehler beim Speichern der Items:', error);
    }
  }, [items]);

  // Debounced Save-Funktion für bessere Performance
  const debounceSaveItemsToStorage = useCallback(() => {
    // Setze Timer zurück, wenn er bereits läuft
    if (saveDebounceTimer !== null) {
      window.clearTimeout(saveDebounceTimer);
    }

    // Setze neuen Timer
    saveDebounceTimer = window.setTimeout(() => {
      saveItemsToStorage();
      saveDebounceTimer = null;
    }, saveDebounceDelay);
  }, [saveItemsToStorage]);

  // Reaktion auf Änderungen an den Items mit verbesserten Abhängigkeiten
  useEffect(() => {
    if (items.length > 0) {
      debounceSaveItemsToStorage();
    }
  }, [items, debounceSaveItemsToStorage]);
  
  useEffect(() => {
    const saveCategories = async () => {
      if (categories.length > 0) {
        try {
          // Konvertiere Datum-Objekte zu ISO-Strings für die Speicherung
          // und stelle sicher, dass createdAt und updatedAt korrekt formatiert sind
          const categoriesForStorage = categories.map(category => {
            // Erstelle eine Kopie der Kategorie
            const categoryCopy: any = { ...category };
            
            // Normalisiere createdAt
            if (category.createdAt instanceof Date) {
              categoryCopy.createdAt = category.createdAt.toISOString();
            } else if (typeof category.createdAt === 'string') {
              const createdAtStr = category.createdAt as string;
              if (createdAtStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                // Bereits ein ISO-String, belassen wie es ist
                categoryCopy.createdAt = createdAtStr;
              } else {
                // Versuche zu konvertieren
                try {
                  const dateObj = new Date(createdAtStr);
                  categoryCopy.createdAt = dateObj.toISOString();
                } catch (e) {
                  console.warn(`Ungültiges createdAt-Datum für Kategorie ${category.id}:`, createdAtStr);
                  categoryCopy.createdAt = new Date().toISOString();
                }
              }
            } else {
              // Kein gültiges Datum, setze aktuelles Datum
              console.warn(`Ungültiger createdAt-Typ für Kategorie ${category.id}:`, typeof category.createdAt);
              categoryCopy.createdAt = new Date().toISOString();
            }
            
            // Normalisiere updatedAt
            if (category.updatedAt instanceof Date) {
              categoryCopy.updatedAt = category.updatedAt.toISOString();
            } else if (typeof category.updatedAt === 'string') {
              const updatedAtStr = category.updatedAt as string;
              if (updatedAtStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                // Bereits ein ISO-String, belassen wie es ist
                categoryCopy.updatedAt = updatedAtStr;
              } else {
                // Versuche zu konvertieren
                try {
                  const dateObj = new Date(updatedAtStr);
                  categoryCopy.updatedAt = dateObj.toISOString();
                } catch (e) {
                  console.warn(`Ungültiges updatedAt-Datum für Kategorie ${category.id}:`, updatedAtStr);
                  categoryCopy.updatedAt = new Date().toISOString();
                }
              }
            } else {
              // Kein gültiges Datum, setze aktuelles Datum
              console.warn(`Ungültiger updatedAt-Typ für Kategorie ${category.id}:`, typeof category.updatedAt);
              categoryCopy.updatedAt = new Date().toISOString();
            }
            
            return categoryCopy;
          });
          
          logger.debug('Saving categories to storage:', categoriesForStorage.length);
          await StorageService.setData(StorageService.STORAGE_KEYS.CATEGORIES, categoriesForStorage);
        } catch (error) {
          console.error('Fehler beim Speichern der Kategorien:', error);
        }
      }
    };
    saveCategories();
  }, [categories]);
  
  // Berechne die Zusammenfassung, wenn sich Daten ändern
  useEffect(() => {
    const calculateSummary = () => {
      const newSummary: CollectionSummary = {
        totalItems: 0,
        totalValue: 0,
        totalCost: 0,
        profitLoss: 0,
        categorySummaries: {}
      };
      
      // Initialisiere Kategoriezusammenfassungen
      categories.forEach(category => {
        newSummary.categorySummaries[category.id] = {
          name: category.name,
          count: 0,
          value: 0,
          cost: 0,
          profitLoss: 0
        };
      });
      
      // Berechne Werte für jedes Item
      items.forEach(item => {
        // Skip, wenn Kategorie nicht existiert
        if (!newSummary.categorySummaries[item.categoryId]) return;
        
        const category = categories.find(c => c.id === item.categoryId);
        if (!category) return;
        
        // Berechne alle Formeln für das Item
        const calculatedValues = calculateItemValue(item);
        
        // Hole berechnete Werte oder Standardwerte
        const totalValue = typeof calculatedValues.totalValue === 'number' 
          ? calculatedValues.totalValue 
          : 0;
          
        const totalCost = typeof calculatedValues.totalCost === 'number' 
          ? calculatedValues.totalCost 
          : 0;
          
        const profitLoss = totalValue - totalCost;

        // Aktualisiere Kategoriezusammenfassung
        newSummary.categorySummaries[item.categoryId].count += 1;
        newSummary.categorySummaries[item.categoryId].value += totalValue;
        newSummary.categorySummaries[item.categoryId].cost += totalCost;
        newSummary.categorySummaries[item.categoryId].profitLoss += profitLoss;
        
        // Aktualisiere Gesamtzusammenfassung
        newSummary.totalItems += 1;
        newSummary.totalValue += totalValue;
        newSummary.totalCost += totalCost;
        newSummary.profitLoss += profitLoss;
      });
      
      setSummary(newSummary);
    };
    
    calculateSummary();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, items]); // calculateItemValue als implizite Abhängigkeit, wird durch ESLint-Regel deaktiviert

  // Hilfsfunktion: Finde eine Kategorie anhand ihrer ID
  const getCategoryById = (id: string): Category | undefined => {
    return categories.find(cat => cat.id === id);
  };
  
  // Funktionen für Kategorien
  const addCategory = (categoryData: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>): string => {
    const id = `cat_${uuidv4()}`;
    const newCategory: Category = {
      ...categoryData,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    setCategories(prev => [...prev, newCategory]);
    return id;
  };
  
  const updateCategory = (id: string, categoryData: Partial<Omit<Category, 'id'>>) => {
    setCategories(prev => 
      prev.map(cat => 
        cat.id === id 
          ? { 
              ...cat, 
              ...categoryData, 
              updatedAt: new Date() 
            } 
          : cat
      )
    );
  };
  
  const deleteCategory = (id: string) => {
    // Entferne die Kategorie
    setCategories(prev => prev.filter(cat => cat.id !== id));
    
    // Entferne auch alle Items dieser Kategorie
    setItems(prev => prev.filter(item => item.categoryId !== id));
  };
  
  // Funktionen für Attribute
  const addAttributeToCategory = (categoryId: string, attributeData: Omit<AttributeDefinition, 'id'>): string => {
    const id = `attr_${uuidv4()}`;
    const newAttribute: AttributeDefinition = {
      ...attributeData,
      id
    };
    
    setCategories(prev => 
      prev.map(cat => 
        cat.id === categoryId 
          ? { 
              ...cat, 
              attributes: [...cat.attributes, newAttribute],
              updatedAt: new Date() 
            } 
          : cat
      )
    );
    
    return id;
  };
  
  const updateAttribute = (categoryId: string, attributeId: string, attributeData: Partial<AttributeDefinition>) => {
    // Alten Attribut-Zustand ermitteln, um einen Typwechsel zu erkennen.
    const oldAttr = categories
      .find(cat => cat.id === categoryId)
      ?.attributes.find(attr => attr.id === attributeId);
    const newType = attributeData.type;
    const typeChanged = !!newType && !!oldAttr && newType !== oldAttr.type;
    const newOptions = attributeData.options ?? oldAttr?.options;

    setCategories(prev =>
      prev.map(cat =>
        cat.id === categoryId
          ? {
              ...cat,
              attributes: cat.attributes.map(attr =>
                attr.id === attributeId
                  ? { ...attr, ...attributeData }
                  : attr
              ),
              updatedAt: new Date()
            }
          : cat
      )
    );

    // Bei einem Typwechsel die vorhandenen Item-Werte migrieren, damit kein
    // z. B. Text-Wert in einem nun als Zahl deklarierten Feld liegen bleibt (#28).
    if (typeChanged && newType) {
      setItems(prev =>
        prev.map(item => {
          if (item.categoryId !== categoryId || !(attributeId in item.values)) {
            return item;
          }
          const coerced = coerceValueToType(item.values[attributeId], newType, newOptions);
          const newValues = { ...item.values };
          if (coerced === undefined) {
            delete newValues[attributeId];
          } else {
            newValues[attributeId] = coerced;
          }
          return { ...item, values: newValues, updatedAt: new Date() };
        })
      );
    }
  };

  const deleteAttribute = (categoryId: string, attributeId: string) => {
    setCategories(prev =>
      prev.map(cat =>
        cat.id === categoryId
          ? {
              ...cat,
              attributes: cat.attributes.filter(attr => attr.id !== attributeId),
              updatedAt: new Date()
            }
          : cat
      )
    );

    // Verwaiste Item-Daten dieses Attributs aus allen Items der Kategorie
    // entfernen — sonst bleiben Werte/Links/Bilder unsichtbar im Store liegen
    // und tauchen bei gleicher neuer Attribut-ID wieder auf (#28).
    setItems(prev =>
      prev.map(item => {
        if (item.categoryId !== categoryId) return item;
        const hasValue = !!item.values && attributeId in item.values;
        const hasLink = !!item.links && attributeId in item.links;
        const hasImage = !!item.images && attributeId in item.images;
        if (!hasValue && !hasLink && !hasImage) return item;

        const newValues = { ...item.values };
        delete newValues[attributeId];

        let newLinks = item.links;
        if (hasLink) {
          newLinks = { ...item.links };
          delete newLinks![attributeId];
        }

        let newImages = item.images;
        if (hasImage) {
          newImages = { ...item.images };
          delete newImages![attributeId];
        }

        return {
          ...item,
          values: newValues,
          links: newLinks,
          images: newImages,
          updatedAt: new Date(),
        };
      })
    );
  };
  
  // Funktionen für Items
  const addItem = (
    categoryId: string,
    values: { [key: string]: any },
    options?: {
      links?: { [attributeId: string]: string };
      images?: { [attributeId: string]: string };
    }
  ): string => {
    const id = `item_${uuidv4()}`;

    const newItem: CollectionItem = {
      id,
      categoryId,
      values,
      ...(options?.links && Object.keys(options.links).length > 0
        ? { links: options.links }
        : {}),
      ...(options?.images && Object.keys(options.images).length > 0
        ? { images: options.images }
        : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setItems(prev => [...prev, newItem]);
    return id;
  };
  
  /**
   * Aktualisiert ein einzelnes Item mit optimierter Fehlerbehandlung und Synchronisation
   * @param id Item-ID
   * @param values Zu aktualisierende Werte
   */
  const updateItem = (id: string, values: { [key: string]: any }) => {
    // Debugging für den Update-Prozess
    logger.debug(`[updateItem] Starte Update für Item ${id} mit Werten:`, values);

    // Sofortiges UI-Update für bessere User Experience
    setItems(prevItems => {
      const updatedItems = prevItems.map(item => {
        if (item.id === id) {
          const updatedItem = {
            ...item,
            values: {
              ...item.values,
              ...values
            },
            updatedAt: new Date()
          };
          logger.debug(`[updateItem] UI-Update für Item ${id} abgeschlossen:`, updatedItem.values);
          return updatedItem;
        }
        return item;
      });
      return updatedItems;
    });

    // Storage-Update asynchron durchführen, ohne die UI zu beeinflussen
    const updateStorage = async () => {
      try {
        // Flag setzen, um useEffect-Loops zu vermeiden
        directUpdateInProgress.value = true;
        
        logger.debug(`[updateItem] Starte Storage-Update für Item ${id}`);
        
        // Atomares Update verwenden
        const success = await StorageService.atomicUpdateItem(id, (item) => {
          const updatedItem = {
            ...item,
            values: {
              ...item.values,
              ...values
            },
            updatedAt: new Date()
          };
          
          logger.debug(`[updateItem] Storage-Update-Funktion für Item ${id}:`, updatedItem.values);
          return updatedItem;
        });
        
        if (success) {
          logger.debug(`[updateItem] Storage-Update für Item ${id} erfolgreich`);
        } else {
          console.error(`[updateItem] Storage-Update für Item ${id} fehlgeschlagen`);
          
          // Bei Fehlern: Reload der Daten aus dem Storage, um Konsistenz sicherzustellen
          const allItems = await StorageService.getData<CollectionItem[]>(StorageService.STORAGE_KEYS.ITEMS) || [];
          
          // Verifiziere, ob das Item korrekt gespeichert wurde
          const verifiedItem = allItems.find(item => item.id === id);
          if (verifiedItem) {
            const expectedValues = JSON.stringify({ ...verifiedItem.values, ...values });
            const actualValues = JSON.stringify(verifiedItem.values);
            
            if (expectedValues !== actualValues) {
              console.error(`[updateItem] Werte nicht korrekt gespeichert, lade aus Storage neu`);
              setItems(allItems);
            }
          }
        }
      } catch (error) {
        console.error(`[updateItem] Fehler beim Storage-Update für Item ${id}:`, error);
      } finally {
        // Flag zurücksetzen
        directUpdateInProgress.value = false;
      }
    };
    
    // Storage-Update starten, aber nicht auf Ergebnis warten
    updateStorage();
  };
  
  const deleteItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };
  
  const deleteMultipleItems = (ids: string[]) => {
    if (ids.length === 0) return;
    
    setItems(prev => prev.filter(item => !ids.includes(item.id)));
  };
  
  const getItemsByCategoryId = (categoryId: string): CollectionItem[] => {
    return items.filter(item => item.categoryId === categoryId);
  };
  
  // Delegiert an die reine Formel-Auswertung in src/utils/formula.ts
  // (kann jetzt unabhängig vom React-Kontext getestet werden).
  const calculateFormula = (
    formula: string,
    values: { [key: string]: any }
  ): any => evaluateFormula(formula, values);
  
  const calculateItemValue = (item: CollectionItem): { [key: string]: any } => {
    const category = getCategoryById(item.categoryId);
    if (!category) return item.values;
    
    // Kopiere die aktuellen Werte
    const calculatedValues = { ...item.values };
    
    // Finde berechnete Attribute
    const calculatedAttributes = category.attributes.filter(attr => attr.isCalculated);
    
    // Berechne jedes berechnete Attribut
    calculatedAttributes.forEach(attr => {
      if (attr.formula) {
        calculatedValues[attr.id] = calculateFormula(attr.formula, calculatedValues);
      }
    });
    
    return calculatedValues;
  };
  
  // Import/Export/Reset-Funktionen
  const exportData = () => {
    // Optimiere den Export, indem wir die Daten in Batches verarbeiten
    // und unnötige temporäre Kopien vermeiden
    
    // Original categories ohne Änderungen zurückgeben
    // weil beim Import sowieso normalisiert wird
    return {
      categories,
      items
    };
  };
  
  const exportCategoryAsCSV = (categoryId: string) => {
    const category = getCategoryById(categoryId);
    if (!category) return null;
    return buildCategoryCSV(category, getItemsByCategoryId(categoryId));
  };
  
  const createCategoryTemplate = (categoryId: string) => {
    const category = getCategoryById(categoryId);
    if (!category) return null;
    return buildCategoryTemplateCSV(category);
  };
  
  const importCSV = (categoryId: string, csvContent: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) {
      return { success: false, count: 0, errors: ['Kategorie nicht gefunden'], imageInfoRowCount: 0 };
    }

    // CSV in logische Zeilen aufteilen — RFC-4180-konform, damit \n
    // innerhalb gequoteter Felder die Zeile nicht zerreißt.
    const lines = splitCSVRows(csvContent);
    if (lines.length < 2) {
      return { success: false, count: 0, errors: ['CSV hat zu wenige Zeilen'], imageInfoRowCount: 0 };
    }
    
    // Spaltenüberschriften extrahieren und parsen
    const headers = parseCSVRow(lines[0]);
    
    // Analysiere die Spaltenüberschriften, um normale Attribute, Link-Spalten und Bild-Info-Spalten zu identifizieren
    const standardHeaders: { [key: string]: string } = {}; // Header-Name -> Attribut-ID
    const linkHeaders: { [key: string]: string } = {}; // Link-Header-Name -> Attribut-ID
    const imageHeaders: { [key: string]: string } = {}; // Bild-Info-Header-Name -> Attribut-ID
    
    category.attributes.forEach(attr => {
      // Suche nach dem regulären Attributnamen
      const headerIndex = headers.findIndex(h => h === attr.name);
      if (headerIndex !== -1) {
        standardHeaders[headers[headerIndex]] = attr.id;
      }
      
      // Suche nach Link-Spalten (z.B. "Name (Link)")
      const linkHeaderIndex = headers.findIndex(h => h === `${attr.name} (Link)`);
      if (linkHeaderIndex !== -1) {
        linkHeaders[headers[linkHeaderIndex]] = attr.id;
      }
      
      // Suche nach Bild-Info-Spalten (z.B. "Name (Bild-Info)")
      const imageHeaderIndex = headers.findIndex(h => h === `${attr.name} (Bild-Info)`);
      if (imageHeaderIndex !== -1) {
        imageHeaders[headers[imageHeaderIndex]] = attr.id;
      }
    });
    
    // Prüfe, ob erforderliche Attribute vorhanden sind.
    // Berechnete Attribute (totalCost, totalValue, profitLoss) sind
    // zwar als required deklariert, werden vom Export aber bewusst
    // ausgelassen (sie werden zur Laufzeit aus den Eingabewerten
    // abgeleitet). Sie hier mitzuprüfen würde jeden Round-Trip
    // CSV-Export → CSV-Import unmöglich machen.
    const requiredAttributes = category.attributes.filter(
      attr => attr.required && !attr.isCalculated
    );
    const missingRequired = requiredAttributes.filter(attr =>
      !Object.values(standardHeaders).includes(attr.id)
    );
    
    if (missingRequired.length > 0) {
      return {
        success: false,
        count: 0,
        errors: [`Fehlende erforderliche Spalten: ${missingRequired.map(attr => attr.name).join(', ')}`],
        imageInfoRowCount: 0,
      };
    }

    const results = {
      success: true,
      count: 0,
      errors: [] as string[],
      imageInfoRowCount: 0,
    };
    
    // Daten verarbeiten
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue; // Leere Zeilen überspringen
      
      try {
        // Parse die CSV-Zeile mit Unterstützung für Anführungszeichen und Kommas in Werten
        const values = parseCSVRow(lines[i]);
        
        if (values.length < Object.keys(standardHeaders).length) {
          results.errors.push(`Zeile ${i+1}: Zu wenige Werte (${values.length}, erwartet mindestens ${Object.keys(standardHeaders).length})`);
          continue;
        }
        
        const itemValues: { [key: string]: any } = {};
        const itemLinks: { [key: string]: string } = {};
        
        // Verarbeite reguläre Attributwerte
        Object.entries(standardHeaders).forEach(([header, attrId]) => {
          const headerIndex = headers.indexOf(header);
          if (headerIndex === -1 || headerIndex >= values.length) return;
          
          const value = values[headerIndex].trim();
          const attr = category.attributes.find(a => a.id === attrId);
          if (!attr) return;
          
          // Wert entsprechend des Datentyps konvertieren
          if (attr.type === 'number') {
            itemValues[attrId] = value === '' ? 0 : parseDecimal(value);
            if (isNaN(itemValues[attrId])) {
              results.errors.push(`Zeile ${i+1}, Spalte ${header}: Ungültiger Zahlenwert "${value}"`);
              itemValues[attrId] = 0;
            }
          } else if (attr.type === 'boolean') {
            const lowerValue = value.toLowerCase();
            itemValues[attrId] = lowerValue === 'true' || lowerValue === 'ja' || lowerValue === '1';
          } else if (attr.type === 'date') {
            if (value === '') {
              itemValues[attrId] = null;
            } else {
              const date = new Date(value);
              if (isNaN(date.getTime())) {
                // Versuche deutsches Format (DD.MM.YYYY)
                const parts = value.split('.');
                if (parts.length === 3) {
                  const germanDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                  if (!isNaN(germanDate.getTime())) {
                    itemValues[attrId] = germanDate.toISOString();
                  } else {
                    results.errors.push(`Zeile ${i+1}, Spalte ${header}: Ungültiges Datum "${value}"`);
                    itemValues[attrId] = null;
                  }
                } else {
                  results.errors.push(`Zeile ${i+1}, Spalte ${header}: Ungültiges Datum "${value}"`);
                  itemValues[attrId] = null;
                }
              } else {
                itemValues[attrId] = date.toISOString();
              }
            }
          } else if (attr.type === 'dropdown') {
            // Dropdown-Wert. Der bisherige Code war ein Copy-Paste der
            // date-Branch und versuchte Werte wie "deutsch" als Datum
            // zu parsen, was bei jedem Import 4–6 Pseudo-Warnungen
            // erzeugte und den Wert auf null setzte. Stattdessen den
            // String direkt übernehmen; eine weiche Warnung gibt es
            // nur, wenn der Wert nicht in der Auswahlliste steht.
            if (value === '') {
              itemValues[attrId] = null;
            } else {
              itemValues[attrId] = value;
              if (attr.options && !attr.options.includes(value)) {
                results.errors.push(
                  `Zeile ${i+1}, Spalte ${header}: Wert "${value}" nicht in der Auswahlliste — wird trotzdem importiert`
                );
              }
            }
          } else {
            // Text, Dropdown, etc.
            itemValues[attrId] = value;
          }
        });
        
        // Erkenne, ob die Quelldatei in den (Bild-Info)-Spalten einen
        // Marker für ein vorhandenes Bild trägt. Bilddaten werden bewusst
        // nicht im CSV serialisiert (Base64 zerstört Tabellen-Tools), also
        // zählen wir nur die Zeilen, in denen vorher ein Bild war — die
        // UI kann darauf hinweisen, dass JSON-Export den Round-Trip
        // erhalten hätte.
        const hasImageInfoMarker = Object.entries(imageHeaders).some(
          ([header]) => {
            const headerIndex = headers.indexOf(header);
            if (headerIndex === -1 || headerIndex >= values.length) return false;
            return values[headerIndex].trim() !== '';
          }
        );
        if (hasImageInfoMarker) {
          results.imageInfoRowCount++;
        }

        // Verarbeite Link-Werte
        Object.entries(linkHeaders).forEach(([header, attrId]) => {
          const headerIndex = headers.indexOf(header);
          if (headerIndex === -1 || headerIndex >= values.length) return;
          
          const link = values[headerIndex].trim();
          if (link) {
            // Stelle sicher, dass der Link ein Protokoll hat
            let processedLink = link;
            if (!processedLink.startsWith('http://') && !processedLink.startsWith('https://')) {
              processedLink = 'https://' + processedLink;
            }
            itemLinks[attrId] = processedLink;
          }
        });
        
        // Item inklusive Links in einem Rutsch hinzufügen. Vorher gab
        // es eine Race Condition: addItem queued ein setItems(...),
        // addLinkToItem las direkt vom Storage und fand das neue Item
        // dort noch nicht — die Links gingen lautlos verloren.
        try {
          addItem(categoryId, itemValues, {
            links: Object.keys(itemLinks).length > 0 ? itemLinks : undefined,
          });
          results.count++;
        } catch (error) {
          results.errors.push(`Zeile ${i+1}: ${(error as Error).message}`);
        }
      } catch (error) {
        results.errors.push(`Zeile ${i+1}: Fehler beim Parsen der CSV-Zeile - ${(error as Error).message}`);
      }
    }
    
    return {
      success: results.count > 0,
      count: results.count,
      errors: results.errors,
      imageInfoRowCount: results.imageInfoRowCount,
    };
  };

  
  const importData = (data: { categories: Category[], items: CollectionItem[] }) => {
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
            
            logger.debug(`Processing batch ${i+1}/${batches} (items ${start+1}-${end})`);
            
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
      updatedAt: new Date()
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
  
  // Funktionen für Bilder und Links
  const addImageToItem = (itemId: string, attributeId: string, imageData: string) => {
    setItems(prev => 
      prev.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            images: {
              ...(item.images || {}),
              [attributeId]: imageData
            },
            updatedAt: new Date()
          };
        }
        return item;
      })
    );
  };
  
  const removeImageFromItem = (itemId: string, attributeId: string) => {
    setItems(prev => 
      prev.map(item => {
        if (item.id === itemId && item.images) {
          const newImages = { ...item.images };
          delete newImages[attributeId];
          
          return {
            ...item,
            images: Object.keys(newImages).length > 0 ? newImages : undefined,
            updatedAt: new Date()
          };
        }
        return item;
      })
    );
  };
  
  const addLinkToItem = (itemId: string, attributeId: string, url: string) => {
    logger.debug(`addLinkToItem aufgerufen: itemId=${itemId}, attributeId=${attributeId}, url=${url}`);
    
    // Wenn die URL leer ist, entferne den Link stattdessen
    if (!url || url.trim() === '') {
      logger.debug('URL ist leer, entferne Link stattdessen');
      return removeLinkFromItem(itemId, attributeId);
    }
    
    // Verarbeite die URL - stelle sicher, dass es eine gültige URL ist
    let processedUrl = url.trim();
    // Füge das Protokoll hinzu, wenn es fehlt
    if (!processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
      processedUrl = 'https://' + processedUrl;
      logger.debug(`Protokoll hinzugefügt: ${processedUrl}`);
    }
    
    // Direkter Storage-Update-Ansatz, um Race Conditions zu vermeiden
    const updateStorageDirectly = async () => {
      try {
        // Flag setzen, um den useEffect zu blockieren
        directUpdateInProgress.value = true;
        
        // Alle Items aus dem Storage holen
        const allItems = await StorageService.getData<any[]>(StorageService.STORAGE_KEYS.ITEMS) || [];
        
        // Finde das zu aktualisierende Item
        const itemIndex = allItems.findIndex(item => item.id === itemId);
        if (itemIndex === -1) {
          console.error(`Item mit ID ${itemId} nicht im Storage gefunden`);
          directUpdateInProgress.value = false;
          return;
        }
        
        logger.debug(`Item im Storage gefunden an Position ${itemIndex}`);
        
        // Deep Clone des Items für Aktualisierung
        const itemToUpdate = JSON.parse(JSON.stringify(allItems[itemIndex]));
        
        // Stelle sicher, dass ein links-Objekt existiert
        if (!itemToUpdate.links) {
          itemToUpdate.links = {};
        }
        
        // Link hinzufügen/aktualisieren
        itemToUpdate.links[attributeId] = processedUrl;
        logger.debug(`Link gesetzt für ${attributeId}:`, processedUrl);
        
        // updatedAt aktualisieren
        itemToUpdate.updatedAt = new Date().toISOString();
        
        // Item im Array ersetzen
        allItems[itemIndex] = itemToUpdate;
        
        // Alle Items zurück in den Storage schreiben
        logger.debug('Speichere aktualisierte Items im Storage...');
        await StorageService.setData(StorageService.STORAGE_KEYS.ITEMS, allItems);
        
        // State aktualisieren (nach Storage-Update) - nur einmal, ohne setTimeout
        logger.debug('Aktualisiere State mit Storage-Daten...');
        setItems(prevItems => {
          const newItems = [...prevItems];
          const stateItemIndex = newItems.findIndex(item => item.id === itemId);
          
          if (stateItemIndex !== -1) {
            // Erstelle ein neues Item-Objekt für State-Update
            const updatedStateItem = {...newItems[stateItemIndex]};
            
            // Stelle sicher, dass Links-Objekt existiert
            if (!updatedStateItem.links) {
              updatedStateItem.links = {};
            }
            
            // Füge den Link hinzu oder aktualisiere ihn
            updatedStateItem.links[attributeId] = processedUrl;
            
            // Aktualisiere Datum
            updatedStateItem.updatedAt = new Date();
            
            // Ersetze das Item im State
            newItems[stateItemIndex] = updatedStateItem;
          }
          
          return newItems;
        });
        
        // Flag zurücksetzen
        directUpdateInProgress.value = false;
        
        // Optional: Verifizierung in Entwicklungsumgebung, wenn DEBUG flag gesetzt ist
        if (process.env.NODE_ENV === 'development' && false) { // Deaktiviert für bessere Performance
          setTimeout(async () => {
            try {
              const verifyItems = await StorageService.getData<any[]>(StorageService.STORAGE_KEYS.ITEMS);
              const verifiedItem = verifyItems?.find(item => item.id === itemId);
              
              if (verifiedItem?.links?.[attributeId] === processedUrl) {
                logger.debug('Verifizierung erfolgreich: Link wurde korrekt gespeichert');
              } else {
                console.error('Verifizierung fehlgeschlagen: Link wurde nicht korrekt gespeichert', 
                  verifiedItem?.links?.[attributeId], 'statt', processedUrl);
              }
            } catch (error) {
              console.error('Fehler bei der Verifizierung:', error);
            }
          }, 100);
        }
      } catch (error) {
        console.error('Fehler beim Link-Update:', error);
        directUpdateInProgress.value = false;
        
        // Fallback auf den State-Update-Ansatz
        setItems(prevItems => prevItems.map(item => {
          if (item.id === itemId) {
            const updatedItem = {...item};
            if (!updatedItem.links) updatedItem.links = {};
            updatedItem.links[attributeId] = processedUrl;
            updatedItem.updatedAt = new Date();
            return updatedItem;
          }
          return item;
        }));
      }
    };
    
    // Starte den Prozess
    updateStorageDirectly();
  };
  
  const removeLinkFromItem = (itemId: string, attributeId: string) => {
    // Ähnlich radikale Methode zum Entfernen von Links
    let updatedItems = [...items]; // Erstelle eine Kopie aller Items
    
    // Finde das zu aktualisierende Item
    const itemIndex = updatedItems.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return; // Item nicht gefunden
    
    // Prüfe, ob das Item und die Links existieren
    const item = updatedItems[itemIndex];
    if (!item.links) return; // Keine Links zu entfernen
    
    // Überprüfe, ob der zu entfernende Link existiert
    if (!(attributeId in item.links)) {
      return; // Nichts zu entfernen
    }
    
    // Erstelle ein vollständig neues Item-Objekt durch Deep Clone
    const itemCopy = JSON.parse(JSON.stringify(item));
    
    // Erstelle ein neues links-Objekt
    const links: Record<string, string> = {};
    
    // Kopiere alle Links außer dem zu entfernenden
    Object.entries(itemCopy.links as Record<string, string>).forEach(([key, value]) => {
      if (key !== attributeId) {
        links[key] = value;
      }
    });
    
    // Setze das neue links-Objekt oder undefined, wenn es leer ist
    itemCopy.links = Object.keys(links).length > 0 ? links : undefined;
    itemCopy.updatedAt = new Date();
    
    // Ersetze das Item in der Array-Kopie
    updatedItems[itemIndex] = itemCopy;
    
    // Aktualisiere den State mit der neuen Array
    setItems(updatedItems);
    
    // Für 100% Sicherheit, stelle sicher, dass React den Zustand wirklich aktualisiert
    setTimeout(() => {
      setItems(prev => [...prev]);
    }, 10);
  };
  
  // Neue Funktion zum Bereinigen von Excel-Import-Links
  const cleanupItemLinks = (itemId: string) => {
    let updatedItems = [...items]; // Erstelle eine Kopie aller Items
    
    // Finde das zu aktualisierende Item
    const itemIndex = updatedItems.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return; // Item nicht gefunden
    
    // Prüfe, ob das Item und die Links existieren
    const item = updatedItems[itemIndex];
    if (!item.links) return; // Keine Links zu bereinigen
    
    // Erstelle ein vollständig neues Item-Objekt durch Deep Clone
    const itemCopy = JSON.parse(JSON.stringify(item));
    
    // Erstelle ein neues links-Objekt
    const links: Record<string, string> = {};
    
    // Kopiere und bereinige nur gültige Links
    let hasChanges = false;
    Object.entries(itemCopy.links as Record<string, string>).forEach(([key, value]) => {
      if (value && value.trim() !== '') {
        // URL bereinigen
        let processedUrl = value.trim();
        // Protokoll hinzufügen wenn nötig
        if (!processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
          processedUrl = 'https://' + processedUrl;
          hasChanges = true;
        }
        
        // Nur wenn die URL sich geändert hat oder die Bereinigung die URL nicht leer gemacht hat
        if (processedUrl !== value || processedUrl !== '') {
          links[key] = processedUrl;
        }
      }
    });
    
    // Nur wenn es tatsächlich Änderungen gab oder Links entfernt wurden
    if (hasChanges || Object.keys(links).length !== Object.keys(itemCopy.links).length) {
      // Setze das neue links-Objekt oder undefined, wenn es leer ist
      itemCopy.links = Object.keys(links).length > 0 ? links : undefined;
      itemCopy.updatedAt = new Date();
      
      // Ersetze das Item in der Array-Kopie
      updatedItems[itemIndex] = itemCopy;
      
      // Aktualisiere den State mit der neuen Array
      setItems(updatedItems);
      
      // Für 100% Sicherheit, stelle sicher, dass React den Zustand wirklich aktualisiert
      setTimeout(() => {
        setItems(prev => [...prev]);
      }, 10);
    }
  };
  
  /**
   * Korrigiert die Kategorie-IDs von Items
   * Unterstützt zwei Modi:
   * 1. Korrektur aller Items einer Kategorie (isSingleItem = false)
   * 2. Korrektur eines einzelnen Items anhand seiner ID (isSingleItem = true)
   * 
   * @param sourceIdOrItemId Die Quell-Kategorie-ID oder die Item-ID (wenn isSingleItem=true)
   * @param targetId Die Ziel-Kategorie-ID, die verwendet werden soll
   * @param isSingleItem Wenn true, wird sourceIdOrItemId als Item-ID interpretiert
   * @returns Objekt mit Informationen über die Anzahl der korrigierten Items
   */
  const correctItemCategories = (
    sourceIdOrItemId: string, 
    targetId: string, 
    isSingleItem: boolean = false
  ) => {
    // Nur verarbeiten, wenn die Kategorie-ID gültig ist
    const targetCategory = categories.find(c => c.id === targetId);
    if (!targetCategory) {
      return { 
        success: false, 
        correctedCount: 0,
        error: "Ziel-Kategorie nicht gefunden" 
      };
    }

    // Logge zur Fehlersuche Informationen über alle Items
    if (targetId === 'sealed' && process.env.NODE_ENV === 'development') {
      logger.debug(`Gesamtanzahl Items: ${items.length}`);
      logger.debug(`Items mit categoryId 'sealed': ${items.filter(i => i.categoryId === 'sealed').length}`);
      
      // Sammle alle unterschiedlichen categoryIds
      const categoryIdCounts = new Map<string, number>();
      items.forEach(item => {
        const count = categoryIdCounts.get(item.categoryId) || 0;
        categoryIdCounts.set(item.categoryId, count + 1);
      });
      
      logger.debug("Verteilung der categoryIds:", 
        Array.from(categoryIdCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([id, count]) => `${id}: ${count}`)
      );
    }

    // Bestimme die zu korrigierenden Items
    let itemsToCorrect: CollectionItem[] = [];

    if (isSingleItem) {
      // Modus 1: Einzelnes Item anhand seiner ID korrigieren
      const item = items.find(item => item.id === sourceIdOrItemId);
      if (!item) {
        return {
          success: false,
          correctedCount: 0,
          error: `Item mit ID ${sourceIdOrItemId} nicht gefunden`
        };
      }
      itemsToCorrect = [item];
    } else if (targetId === 'sealed') {
      // Modus 2A: Erweiterte Erkennung für Sealed-Produkte - jetzt noch umfangreicher
      itemsToCorrect = items.filter(item => {
        // Bereits korrekt zugeordnete Items überspringen
        if (item.categoryId === 'sealed') {
          return false;
        }
        
        // Schritt 1: Nach kategorie-basierten Hinweisen suchen - sehr umfassende Prüfung
        if (
          // Varianten der Kategorie-ID mit 'seal'
          item.categoryId.toLowerCase().includes('seal') ||
          item.categoryId.toLowerCase() === 's' ||
          item.categoryId.toLowerCase() === 'se' ||
          item.categoryId.toLowerCase() === 'sealedproducts' ||
          item.categoryId.toLowerCase() === 'sealed products' ||
          item.categoryId.toLowerCase() === 'se_pr' ||
          item.categoryId.toLowerCase() === 'sealprod' ||
          item.categoryId.toLowerCase() === 'verschlossen' ||
          item.categoryId.toLowerCase() === 'verpackt' ||
          item.categoryId.toLowerCase() === 'ungeöffnet' ||
          // Varianten mit ähnlichen Bezeichnungen
          item.categoryId.toLowerCase().includes('booster') ||
          item.categoryId.toLowerCase().includes('pack') ||
          item.categoryId.toLowerCase().includes('display') ||
          item.categoryId.toLowerCase().includes('box') ||
          item.categoryId.toLowerCase().includes('tin') ||
          item.categoryId.toLowerCase().includes('etb') ||
          item.categoryId.toLowerCase().includes('deck') ||
          item.categoryId.toLowerCase().includes('karten set') ||
          item.categoryId.toLowerCase().includes('kartenset') ||
          item.categoryId.toLowerCase().includes('premium') ||
          item.categoryId.toLowerCase().includes('bundle') ||
          item.categoryId.toLowerCase().includes('set') ||
          item.categoryId.toLowerCase().includes('collection')
        ) {
          return true;
        }

        // Schritt 2: Nach attribut-basierten Hinweisen suchen
        const hasTypicalSealedAttributes = 
          // Hat typische Kategorie-Werte für Sealed-Produkte
          (item.values?.category && (
            // Direkte Übereinstimmungen mit bekannten Sealed-Produkt-Kategorien
            ['Booster', 'Blister', 'Display', 'Elite Trainer Box', 'ETB', 'Box Sets', 'Tin Box', 'Mini Tin Box', 
             'Box', 'Tin', 'Pack', 'Collection Box', 'Premium Box', 'Starter Set', 'Deck', 'Theme Deck',
             'Special Set', 'Collector Box', 'Bundle', 'Bundle Box', 'Collector Chest', 'V Box',
             'V Collection', 'V Premium Collection', 'V Union', 'V VMAX', 'Promo Box'].includes(item.values.category) ||
            // Teilübereinstimmungen in Kategorie
            item.values.category.toLowerCase().includes('booster') ||
            item.values.category.toLowerCase().includes('display') ||
            item.values.category.toLowerCase().includes('box') ||
            item.values.category.toLowerCase().includes('tin') ||
            item.values.category.toLowerCase().includes('etb') ||
            item.values.category.toLowerCase().includes('elite') ||
            item.values.category.toLowerCase().includes('blister') ||
            item.values.category.toLowerCase().includes('pack') ||
            item.values.category.toLowerCase().includes('deck') ||
            item.values.category.toLowerCase().includes('set') ||
            item.values.category.toLowerCase().includes('collection') ||
            item.values.category.toLowerCase().includes('bundle') ||
            item.values.category.toLowerCase().includes('premium') ||
            item.values.category.toLowerCase().includes('trainer') ||
            item.values.category.toLowerCase().includes('chest') ||
            item.values.category.toLowerCase().includes('theme')
          )) ||
          // Hat einen Namen, der auf Sealed-Produkt schließen lässt
          (item.values?.name && (
            item.values.name.toLowerCase().includes('booster') ||
            item.values.name.toLowerCase().includes('display') ||
            item.values.name.toLowerCase().includes('elite trainer box') ||
            item.values.name.toLowerCase().includes('etb') ||
            item.values.name.toLowerCase().includes('tin') ||
            item.values.name.toLowerCase().includes('box') ||
            item.values.name.toLowerCase().includes('blister') ||
            item.values.name.toLowerCase().includes('pack') ||
            item.values.name.toLowerCase().includes('deck') ||
            item.values.name.toLowerCase().includes('set') ||
            item.values.name.toLowerCase().includes('collection') ||
            item.values.name.toLowerCase().includes('bundle') ||
            item.values.name.toLowerCase().includes('premium') ||
            item.values.name.toLowerCase().includes('trainer') ||
            item.values.name.toLowerCase().includes('chest') ||
            item.values.name.toLowerCase().includes('theme') ||
            item.values.name.toLowerCase().includes(' v ') ||
            item.values.name.toLowerCase().includes('vmax') ||
            item.values.name.toLowerCase().includes('promo')
          )) ||
          // Hat Preis/Wert/Typ-Angaben, die auf Sealed-Produkt hindeuten
          (
            // Wenn andere typische Attribute für Sealed-Produkte vorhanden sind
            item.values?.type === 'Sealed' ||
            item.values?.packart ||
            item.values?.anzahl_packungen ||
            item.values?.release_date ||
            item.values?.wave ||
            item.values?.edition ||
            item.values?.material ||
            // Oder der Wert deutlich höher ist als typische Einzelkarten
            (typeof item.values?.value === 'number' && item.values.value > 15)
          );

        // Schritt 3: Auf Basis des Gesamtbildes entscheiden
        return hasTypicalSealedAttributes;
      });
      
      if (process.env.NODE_ENV === 'development') {
        logger.debug(`Gefundene zu korrigierende Sealed-Produkte: ${itemsToCorrect.length}`);
        // Für jeden Fund die Kategorie-ID und den Namen ausgeben
        itemsToCorrect.forEach(item => {
          logger.debug(`ID: ${item.id}, KategorieID: ${item.categoryId}, Name: ${item.values.name || 'kein Name'}`);
        });
      }
    } else {
      // Modus 2B: Standard-Prüfung für andere Kategorien
      itemsToCorrect = items.filter(item => {
        // Exakt gleiche ID => kein Problem
        if (item.categoryId === targetId) {
          return false;
        }
        
        // Für andere Kategorien: Prüfe auf Groß-/Kleinschreibung oder Teilübereinstimmungen
        return (
          item.categoryId.toLowerCase() === sourceIdOrItemId.toLowerCase() || 
          item.categoryId.includes(sourceIdOrItemId) || 
          sourceIdOrItemId.includes(item.categoryId)
        );
      });
    }

    if (itemsToCorrect.length === 0) {
      return {
        success: true,
        correctedCount: 0,
        error: null
      };
    }

    // Items korrigieren (direkt im State und Storage)
    setItems(prevItems => 
      prevItems.map(item => {
        if (itemsToCorrect.some(i => i.id === item.id)) {
          return {
            ...item,
            categoryId: targetId,
            updatedAt: new Date()
          };
        }
        return item;
      })
    );

    // Direktes Update im Storage
    const updateStorage = async () => {
      try {
        const allStoredItems = await StorageService.getData<any[]>(StorageService.STORAGE_KEYS.ITEMS) || [];
        
        // Korrigiere die Items im Storage
        const updatedStorageItems = allStoredItems.map(item => {
          if (itemsToCorrect.some(i => i.id === item.id)) {
            return {
              ...item,
              categoryId: targetId,
              updatedAt: new Date().toISOString()
            };
          }
          return item;
        });
        
        // Schreibe die korrigierten Items zurück
        await StorageService.setData(StorageService.STORAGE_KEYS.ITEMS, updatedStorageItems);
        
        // Optional: Erneute Verifizierung
        logger.debug(`${itemsToCorrect.length} Items wurden korrigiert und im Storage aktualisiert.`);
      } catch (error) {
        console.error('Fehler beim Storage-Update nach Kategorie-Korrektur:', error);
      }
    };
    
    updateStorage();

    return {
      success: true,
      correctedCount: itemsToCorrect.length,
      error: null
    };
  };

  // Context-Werte
  const contextValue: CollectionContextType = {
    categories,
    items,
    summary,
    
    addCategory,
    updateCategory,
    deleteCategory,
    
    addAttributeToCategory,
    updateAttribute,
    deleteAttribute,
    
    addItem,
    updateItem,
    deleteItem,
    deleteMultipleItems,
    getItemsByCategoryId,
    setItems,
    
    addImageToItem,
    removeImageFromItem,
    addLinkToItem,
    removeLinkFromItem,
    cleanupItemLinks,
    
    calculateItemValue,
    calculateFormula,
    
    exportData,
    exportCategoryAsCSV,
    createCategoryTemplate,
    importCSV,
    importData,
    resetToDefaults,
    
    // Excel-Funktionen
    exportCategoryAsExcel,
    createExcelTemplate,
    exportCollectionAsExcel,
    
    // Fehlerkorrekturen
    correctItemCategories
  };
  
  return (
    <CollectionContext.Provider value={contextValue}>
      {children}
    </CollectionContext.Provider>
  );
};

export default CollectionContext;