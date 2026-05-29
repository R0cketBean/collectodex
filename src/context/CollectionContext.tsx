import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ExcelJS from 'exceljs';
import {
  Category,
  CollectionItem,
  CollectionSummary,
  AttributeDefinition,
  DEFAULT_CATEGORIES
} from '../types/models';
import { logger } from '../utils/logger';
import { evaluateFormula } from '../utils/formula';
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
  addItem: (categoryId: string, values: { [key: string]: any }) => string;
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
  importCSV: (categoryId: string, csvContent: string) => { success: boolean, count: number, errors: string[] };
  importExcel: (categoryId: string, excelBuffer: ArrayBuffer) => Promise<{ success: boolean, count: number, errors: string[] }>;
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
  };
  
  // Funktionen für Items
  const addItem = (categoryId: string, values: { [key: string]: any }): string => {
    const id = `item_${uuidv4()}`;
    
    const newItem: CollectionItem = {
      id,
      categoryId,
      values,
      createdAt: new Date(),
      updatedAt: new Date()
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
    
    // Alle Items dieser Kategorie finden
    const categoryItems = getItemsByCategoryId(categoryId);
    
    // Sichtbare und editierbare Attribute für den CSV-Export ermitteln
    const exportAttributes = category.attributes
      .filter(attr => attr.isVisible && !attr.isCalculated)
      .sort((a, b) => a.order - b.order);
    
    // Prüfen, welche Attribute Links oder Bilder haben
    const attributesWithLinks = new Set<string>();
    const attributesWithImages = new Set<string>();
    
    categoryItems.forEach(item => {
      // Links prüfen
      if (item.links) {
        Object.keys(item.links).forEach(attrId => {
          attributesWithLinks.add(attrId);
        });
      }
      
      // Bilder prüfen
      if (item.images) {
        Object.keys(item.images).forEach(attrId => {
          attributesWithImages.add(attrId);
        });
      }
    });
    
    // Header-Zeile erstellen mit zusätzlichen Spalten für Links
    const headers = [...exportAttributes.map(attr => attr.name)];
    
    // Füge Spalten für Links hinzu
    exportAttributes.filter(attr => attributesWithLinks.has(attr.id))
      .forEach(attr => {
        headers.push(`${attr.name} (Link)`);
      });
    
    // Füge Spalten für Bild-Hinweise hinzu
    exportAttributes.filter(attr => attributesWithImages.has(attr.id))
      .forEach(attr => {
        headers.push(`${attr.name} (Bild-Info)`);
      });
    
    // Daten-Zeilen erstellen
    const rows = categoryItems.map(item => {
      const rowData: string[] = [];
      
      // Normale Attributwerte hinzufügen
      exportAttributes.forEach(attr => {
        let value = item.values[attr.id];
        
        // Formatiere je nach Attribut-Typ
        if (value === null || value === undefined) {
          rowData.push('');
        } else if (attr.type === 'number') {
          rowData.push(String(value));
        } else if (attr.type === 'boolean') {
          rowData.push(value ? 'Ja' : 'Nein');
        } else if (attr.type === 'date' && value instanceof Date) {
          rowData.push(value.toISOString().split('T')[0]); // YYYY-MM-DD Format
        } else {
          // Escape Kommas und Anführungszeichen für CSV
          const stringValue = String(value)
            .replace(/"/g, '""'); // Doppelte Anführungszeichen escapen
          
          // Wenn der Wert Kommas, Anführungszeichen oder Zeilenumbrüche enthält, in Anführungszeichen einschließen
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            rowData.push(`"${stringValue}"`);
          } else {
            rowData.push(stringValue);
          }
        }
      });
      
      // Link-Werte hinzufügen
      exportAttributes.filter(attr => attributesWithLinks.has(attr.id))
        .forEach(attr => {
          const link = item.links && item.links[attr.id] ? item.links[attr.id] : '';
          rowData.push(link);
        });
      
      // Bild-Informationen hinzufügen (nur Hinweise, da Base64 in CSV nicht praktikabel ist)
      exportAttributes.filter(attr => attributesWithImages.has(attr.id))
        .forEach(attr => {
          const hasImage = item.images && item.images[attr.id];
          rowData.push(hasImage ? 'Bild verfügbar (nur in JSON-Export)' : '');
        });
      
      return rowData;
    });
    
    // CSV-Header und Zeilen kombinieren
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    return {
      fileName: `${category.name.replace(/\s+/g, '-').toLowerCase()}-export.csv`,
      content: csvContent
    };
  };
  
  const createCategoryTemplate = (categoryId: string) => {
    const category = getCategoryById(categoryId);
    if (!category) return null;
    
    // Editierbare Attribute für das Template ermitteln
    const templateAttributes = category.attributes
      .filter(attr => !attr.isCalculated)
      .sort((a, b) => a.order - b.order);
    
    // Header-Zeile erstellen
    const headers = templateAttributes.map(attr => attr.name);
    
    // Eine leere Beispielzeile erstellen
    const exampleRow = templateAttributes.map(attr => {
      // Beispielwerte je nach Attribut-Typ
      if (attr.type === 'number') {
        return attr.id === 'quantity' ? '1' : '0';
      } else if (attr.type === 'boolean') {
        return 'Ja';
      } else if (attr.type === 'date') {
        return new Date().toISOString().split('T')[0]; // YYYY-MM-DD Format
      } else if (attr.type === 'dropdown' && attr.options && attr.options.length > 0) {
        return attr.options[0];
      } else {
        return 'Beispiel';
      }
    });
    
    // CSV-Header und Beispielzeile kombinieren
    const csvContent = [
      headers.join(','),
      exampleRow.join(',')
    ].join('\n');
    
    return {
      fileName: `${category.name.replace(/\s+/g, '-').toLowerCase()}-template.csv`,
      content: csvContent
    };
  };
  
  const importCSV = (categoryId: string, csvContent: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) {
      return { success: false, count: 0, errors: ['Kategorie nicht gefunden'] };
    }
    
    // CSV in Zeilen aufteilen
    const lines = csvContent.split('\n');
    if (lines.length < 2) {
      return { success: false, count: 0, errors: ['CSV hat zu wenige Zeilen'] };
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
    
    // Prüfe, ob erforderliche Attribute vorhanden sind
    const requiredAttributes = category.attributes.filter(attr => attr.required);
    const missingRequired = requiredAttributes.filter(attr => 
      !Object.values(standardHeaders).includes(attr.id)
    );
    
    if (missingRequired.length > 0) {
      return { 
        success: false, 
        count: 0, 
        errors: [`Fehlende erforderliche Spalten: ${missingRequired.map(attr => attr.name).join(', ')}`] 
      };
    }
    
    const results = {
      success: true,
      count: 0,
      errors: [] as string[]
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
            itemValues[attrId] = value === '' ? 0 : parseFloat(value);
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
            // Dropdown-Wert
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
          } else {
            // Text, Dropdown, etc.
            itemValues[attrId] = value;
          }
        });
        
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
        
        // Item zur Sammlung hinzufügen
        try {
          const newItemId = addItem(categoryId, itemValues);
          
          // Links separat hinzufügen, falls vorhanden
          if (Object.keys(itemLinks).length > 0) {
            Object.entries(itemLinks).forEach(([attrId, url]) => {
              addLinkToItem(newItemId, attrId, url);
            });
          }
          
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
      errors: results.errors
    };
  };
  
  // Hilfsfunktion zum Parsen einer CSV-Zeile unter Berücksichtigung von Anführungszeichen
  const parseCSVRow = (row: string): string[] => {
    const result: string[] = [];
    let insideQuotes = false;
    let currentValue = '';
    
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      const nextChar = i < row.length - 1 ? row[i + 1] : null;
      
      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          // Doppelte Anführungszeichen innerhalb von Anführungszeichen -> einzelnes Anführungszeichen
          currentValue += '"';
          i++; // Überspringe das nächste Anführungszeichen
        } else {
          // Umschalten des insideQuotes-Status
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        // Komma außerhalb von Anführungszeichen -> neuer Wert
        result.push(currentValue);
        currentValue = '';
      } else {
        // Normales Zeichen
        currentValue += char;
      }
    }
    
    // Letzten Wert hinzufügen
    result.push(currentValue);
    
    return result;
  };
  
  const importExcel = async (categoryId: string, excelBuffer: ArrayBuffer): Promise<{ success: boolean, count: number, errors: string[] }> => {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(excelBuffer);
      
      const worksheet = workbook.worksheets[0]; // Erste Arbeitsmappe verwenden
      
      if (!worksheet) {
        return { success: false, count: 0, errors: ["Keine Arbeitsmappe in der Excel-Datei gefunden"] };
      }
      
      // Kategorie und zugehörige Attribute aus dem Context holen
      const category = categories.find(c => c.id === categoryId);
      if (!category) {
        return { success: false, count: 0, errors: ["Kategorie nicht gefunden"] };
      }
      
      const attributes = category.attributes;
      if (!attributes || attributes.length === 0) {
        return { success: false, count: 0, errors: ["Keine Attribute in der Kategorie definiert"] };
      }
      
      // Mapping für Spalten erstellen
      const headerRow = worksheet.getRow(1);
      const attributeMap = new Map<number, string>();
      const errors: string[] = [];
      
      // Iteriere durch die Header-Zellen und erstelle das Mapping
      headerRow.eachCell((cell, colIndex) => {
        const headerText = cell.text.trim();
        // Finde passendes Attribut nach Name
        const matchingAttr = attributes.find(attr => 
          attr.name.toLowerCase() === headerText.toLowerCase() || 
          // Berücksichtige auch Hyperlink-Spalten
          headerText.toLowerCase() === `${attr.name.toLowerCase()} (link)` ||
          headerText.toLowerCase() === `${attr.name.toLowerCase()} (url)` ||
          headerText.toLowerCase() === `${attr.name.toLowerCase()} hyperlink` ||
          headerText.toLowerCase() === `${attr.name.toLowerCase()}-link` ||
          headerText.toLowerCase().startsWith(`${attr.name.toLowerCase()} link`) ||
          // Weitere mögliche Link-Spaltenformate hier hinzufügen
          false
        );
        
        if (matchingAttr) {
          const isLinkColumn = headerText.toLowerCase().includes('link') || 
                               headerText.toLowerCase().includes('url');
          
          if (isLinkColumn) {
            // Speichere als spezielle Link-Spalte
            attributeMap.set(colIndex, `${matchingAttr.id}_hyperlink`);
          } else {
            attributeMap.set(colIndex, matchingAttr.id);
          }
        }
      });
      
      if (attributeMap.size === 0) {
        return { success: false, count: 0, errors: ["Keine passenden Attribute in der Excel-Datei gefunden"] };
      }
      
      const newItems: CollectionItem[] = [];
      
      // Zeilen durchlaufen und Items erstellen (ab Zeile 2, Zeile 1 ist der Header)
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        
        // Prüfe, ob die Zeile leer ist
        let isEmptyRow = true;
        row.eachCell({ includeEmpty: false }, () => {
          isEmptyRow = false;
        });
        
        if (isEmptyRow) continue; // Überspringe leere Zeilen
        
        const itemValues: Record<string, any> = {};
        const hyperlinks: Record<string, string> = {};
        let hasValidKeyData = false; // Für die Name-Prüfung
        
        // Mindestens ein Schlüsselattribut (wie Name) muss Daten enthalten
        
        attributeMap.forEach((attrId, columnIndex) => {
          const attr = attributes.find(a => a.id === attrId);
          if (!attr) return;
          
          try {
            const cell = row.getCell(columnIndex + 1);
            
            // Prüfe auf Hyperlinks
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            let value = cell.value;
            const hyperlink = cell.hyperlink;
            
            // Wenn eine Zelle einen Hyperlink hat, speichere sowohl Text als auch Link
            if (hyperlink && typeof hyperlink === 'string') {
              if (attr.type === 'text') {
                // Für Textattribute: Text mit Link in speziellem Format speichern
                if (cell.text && cell.text.trim() !== '') {
                  itemValues[attrId] = cell.text;
                  
                  // Speichere den Link im links-Objekt des Items anstatt im Wert
                  // Dies wird später beim Erstellen des Items verwendet
                  itemValues[`${attrId}_hyperlink`] = hyperlink;
                  
                  // Wenn es sich um ein Name-Attribut handelt und es Daten enthält, setze hasValidKeyData
                  if (attrId === 'name') {
                    hasValidKeyData = true;
                  }
                } else {
                  // Wenn kein Text, dann nur den Link speichern
                  itemValues[attrId] = hyperlink;
                  itemValues[`${attrId}_hyperlink`] = hyperlink;
                  
                  // Wenn es der Name ist, gilt es als gültige Daten
                  if (attrId === 'name') {
                    hasValidKeyData = true;
                  }
                }
              }
            } else if (attrId.endsWith('_hyperlink')) {
              // Dies ist eine spezielle Link-Spalte
              const baseAttrId = attrId.replace('_hyperlink', '');
              if (cell.value) {
                const linkUrl = String(cell.value).trim();
                if (linkUrl) {
                  hyperlinks[baseAttrId] = linkUrl;
                }
              }
            } else {
              // Normale Wertverarbeitung je nach Attributtyp
              if (attr.type === 'number') {
                // Zahlen-Wert
                if (cell.type === ExcelJS.ValueType.Number) {
                  itemValues[attrId] = cell.value;
                } else if (cell.type === ExcelJS.ValueType.String && cell.value) {
                  // Versuche, den String als Zahl zu parsen
                  const numValue = parseFloat(String(cell.value).replace(',', '.'));
                  itemValues[attrId] = isNaN(numValue) ? 0 : numValue;
                } else {
                  itemValues[attrId] = 0;
                }
              } else if (attr.type === 'boolean') {
                // Boolean-Wert
                if (cell.type === ExcelJS.ValueType.Boolean) {
                  itemValues[attrId] = cell.value;
                } else if (cell.type === ExcelJS.ValueType.String && cell.value) {
                  const strValue = String(cell.value).toLowerCase();
                  itemValues[attrId] = strValue === 'ja' || strValue === 'true' || strValue === '1';
                } else {
                  itemValues[attrId] = false;
                }
              } else if (attr.type === 'date') {
                // Datums-Wert
                if (cell.type === ExcelJS.ValueType.Date && cell.value) {
                  // Excel-Datum-Objekt
                  const dateValue = cell.value as Date;
                  itemValues[attrId] = dateValue.toISOString();
                } else if (cell.type === ExcelJS.ValueType.String && cell.value) {
                  // Versuche, den String als Datum zu parsen
                  try {
                    const dateStr = String(cell.value);
                    // Prüfe auf deutsches Datumsformat (DD.MM.YYYY)
                    if (dateStr.includes('.')) {
                      const parts = dateStr.split('.');
                      if (parts.length === 3) {
                        const date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                        if (!isNaN(date.getTime())) {
                          itemValues[attrId] = date.toISOString();
                        } else {
                          throw new Error('Ungültiges Datum');
                        }
                      } else {
                        throw new Error('Ungültiges Datumsformat');
                      }
                    } else {
                      // Versuche ISO-Format oder andere Formate
                      const date = new Date(dateStr);
                      if (!isNaN(date.getTime())) {
                        itemValues[attrId] = date.toISOString();
                      } else {
                        throw new Error('Ungültiges Datum');
                      }
                    }
                  } catch (e) {
                    errors.push(`Zeile ${rowNumber}: Fehler beim Parsen des Datums für ${attr.name}`);
                    itemValues[attrId] = null;
                  }
                } else {
                  itemValues[attrId] = null;
                }
              } else if (attr.type === 'dropdown') {
                // Dropdown-Wert
                if (cell.type === ExcelJS.ValueType.String || 
                    cell.type === ExcelJS.ValueType.Number ||
                    cell.type === ExcelJS.ValueType.Boolean) {
                  const strValue = cell.value !== null && cell.value !== undefined ? String(cell.value) : '';
                  // Prüfe, ob der Wert in den Optionen des Dropdowns enthalten ist
                  if (attr.options && attr.options.length > 0) {
                    if (attr.options.includes(strValue)) {
                      itemValues[attrId] = strValue;
                    } else {
                      // Wenn der Wert nicht in den Optionen ist, setze einen leeren String
                      itemValues[attrId] = '';
                      errors.push(`Zeile ${rowNumber}: Ungültiger Wert für ${attr.name}. Erlaubte Werte sind: ${attr.options.join(', ')}`);
                    }
                  } else {
                    // Wenn keine Optionen definiert sind, setze den Wert direkt
                    itemValues[attrId] = strValue;
                  }
                } else {
                  itemValues[attrId] = '';
                }
              } else {
                // String-Wert
                if (cell.type === ExcelJS.ValueType.String || 
                    cell.type === ExcelJS.ValueType.Number ||
                    cell.type === ExcelJS.ValueType.Boolean) {
                  // Stelle sicher, dass der Wert nicht null oder undefined ist
                  const strValue = cell.value !== null && cell.value !== undefined ? String(cell.value) : '';
                  itemValues[attrId] = strValue;
                  
                  // Wenn es sich um ein Name-Attribut handelt und es Daten enthält, setze hasValidKeyData
                  if (attrId === 'name' && strValue.trim() !== '') {
                    hasValidKeyData = true;
                  }
                } else {
                  itemValues[attrId] = '';
                }
              }
            }
          } catch (e) {
            errors.push(`Zeile ${rowNumber}: Fehler beim Lesen der Zelle für ${attr.name}`);
            // Standard-Wert setzen
            if (attr.type === 'number') {
              itemValues[attrId] = 0;
            } else if (attr.type === 'boolean') {
              itemValues[attrId] = false;
            } else if (attr.type === 'date') {
              itemValues[attrId] = null;
            } else {
              itemValues[attrId] = '';
            }
          }
        });
        
        // Extrahiere und bereinige Hyperlinks für die spätere Verarbeitung
        for (const key in itemValues) {
          if (key.endsWith('_hyperlink')) {
            const attributeId = key.replace('_hyperlink', '');
            // Bereinige und normalisiere die URL
            let url = itemValues[key];
            if (url && typeof url === 'string') {
              url = url.trim();
              // Füge http:// hinzu, wenn kein Protokoll vorhanden ist
              if (url !== '' && !url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
              }
              
              if (url !== '') {
                hyperlinks[attributeId] = url;
              }
            }
            // Lösche den temporären Hyperlink-Eintrag
            delete itemValues[key];
          }
        }
        
        // Verbesserte Überprüfung, ob die Zeile tatsächlich Daten enthält
        // Mindestens ein Attribut muss einen nicht-leeren Wert haben
        const hasAnyMeaningfulValues = Object.entries(itemValues).some(([key, value]) => {
          if (value === null || value === undefined) return false;
          if (typeof value === 'string' && value.trim() === '') return false;
          if (typeof value === 'number' && value === 0) {
            // Bei Zahlen: 0 ist ein gültiger Wert, aber nicht signifikant für die Entscheidung, 
            // ob ein leerer Datensatz vorliegt - es sei denn, es ist ein Preis oder Wert
            const attr = attributes.find(a => a.id === key);
            if (attr && (key.includes('price') || key.includes('value') || key.includes('cost'))) {
              return true;  // Preise und Kosten mit 0 sind signifikant
            }
            // Für andere numerische Attribute ist 0 nicht signifikant
            return false;
          }
          return true;
        });
        
        // Bei Kategorien, die ein "name"-Attribut haben, muss der Name ausgefüllt sein
        const requiresName = attributes.some(a => a.id === 'name');
        const nameValid = !requiresName || hasValidKeyData;
        
        // Nur Items hinzufügen, die tatsächlich Daten enthalten und gültig sind
        if (hasAnyMeaningfulValues && nameValid) {
          // Neues Item erstellen
          const newItem: CollectionItem = {
            id: `item_${uuidv4()}`,
            categoryId,
            values: itemValues,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          // Hyperlinks hinzufügen, falls vorhanden
          if (Object.keys(hyperlinks).length > 0) {
            // Bereinige nochmals, um sicherzustellen, dass nur gültige Links gespeichert werden
            const cleanLinks: Record<string, string> = {};
            Object.entries(hyperlinks).forEach(([key, value]) => {
              if (value && value.trim() !== '') {
                let url = value.trim();
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                  url = 'https://' + url;
                }
                cleanLinks[key] = url;
              }
            });
            
            if (Object.keys(cleanLinks).length > 0) {
              newItem.links = cleanLinks;
            }
          }
          
          newItems.push(newItem);
        }
      }
      
      // Items hinzufügen
      if (newItems.length > 0) {
        setItems(prev => [...prev, ...newItems]);
        
        // Links in allen neu hinzugefügten Items bereinigen
        setTimeout(() => {
          newItems.forEach(item => {
            cleanupItemLinks(item.id);
          });
        }, 100);
        
        return { 
          success: true, 
          count: newItems.length, 
          errors: errors.length > 0 ? errors : [] 
        };
      }
      
      return { 
        success: false, 
        count: 0, 
        errors: ["Keine Daten zum Importieren gefunden"] 
      };
    } catch (error) {
      console.error("Excel import error:", error);
      return { 
        success: false, 
        count: 0, 
        errors: [`Excel-Import fehlgeschlagen: ${(error as Error).message}`] 
      };
    }
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
      
      if (data.items) {
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
    
    // Alle Items dieser Kategorie finden
    const categoryItems = getItemsByCategoryId(categoryId);
    
    // Sichtbare und editierbare Attribute für den Excel-Export ermitteln
    const exportAttributes = category.attributes
      .filter(attr => attr.isVisible)
      .sort((a, b) => a.order - b.order);
    
    // Excel-Arbeitsmappe erstellen
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CollectODex';
    workbook.created = new Date();
    
    const worksheet = workbook.addWorksheet(category.name, {
      properties: { tabColor: { argb: '4F46E5' } } // Pokemon-Blau
    });
    
    // Header-Zeile erstellen
    const headers = exportAttributes.map(attr => attr.name);
    const headerRow = worksheet.addRow(headers);
    
    // Header formatieren
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '4F46E5' } // Pokemon-Blau
      };
      cell.border = {
        bottom: { style: 'thin', color: { argb: '000000' } }
      };
    });
    
    // Spaltenbreiten anpassen
    headers.forEach((header, i) => {
      worksheet.getColumn(i + 1).width = Math.max(15, header.length + 5);
    });
    
    // Datenzeilen erstellen
    categoryItems.forEach(item => {
      const calculatedValues = calculateItemValue(item);
      const rowData: string[] = [];
      
      exportAttributes.forEach((attr) => {
        let value;
        if (attr.isCalculated) {
          value = calculatedValues[attr.id];
        } else {
          value = item.values[attr.id];
        }
        
        // Wert hinzufügen
        rowData.push(value.toString());
      });
      
      // Zeile hinzufügen
      const row = worksheet.addRow(rowData);
      
      // Links und Hinweise auf Bilder hinzufügen
      exportAttributes.forEach((attr, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        
        // Wenn ein Link für dieses Attribut existiert, setze ihn als Hyperlink
        if (item.links && item.links[attr.id]) {
          // Statt direkt hyperlink zu setzen, verwenden wir die richtige Methode
          if (cell.text) {
            // Wenn bereits Text vorhanden ist, verwenden wir diesen
            worksheet.getCell(cell.address).value = {
              text: cell.text,
              hyperlink: item.links[attr.id]
            };
          } else {
            // Sonst verwenden wir die URL als Text
            worksheet.getCell(cell.address).value = {
              text: item.links[attr.id],
              hyperlink: item.links[attr.id]
            };
          }
          cell.font = { color: { argb: '0000FF' }, underline: true };
        }
        
        // Hinweis hinzufügen, wenn ein Bild existiert (nur beim vollständigen Export)
        if (item.images && item.images[attr.id]) {
          cell.note = "Enthält Bild (nur beim JSON-Export erhalten)";
          
          // Optionale visuelle Markierung für Zellen mit Bildern
          if (!cell.font) cell.font = {};
          cell.font.italic = true;
          if (!item.links || !item.links[attr.id]) {
            cell.font.color = { argb: '808080' }; // Grau
          }
        }
      });
    });
    
    // Formatierung anwenden
    exportAttributes.forEach((attr, colIndex) => {
      const column = worksheet.getColumn(colIndex + 1);
      
      if (attr.type === 'number') {
        if (attr.id === 'price' || attr.id === 'value' || attr.id === 'cost' || attr.name.toLowerCase().includes('preis') || attr.name.toLowerCase().includes('wert') || attr.name.toLowerCase().includes('kosten')) {
          column.numFmt = '€#,##0.00;-€#,##0.00';
        } else if (attr.id === 'quantity' || attr.name.toLowerCase().includes('anzahl')) {
          column.numFmt = '0';
        } else {
          column.numFmt = '0.00';
        }
      } else if (attr.type === 'date') {
        column.numFmt = 'dd.mm.yyyy';
      }
    });
    
    // Excel-Datei erstellen
    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };
  
  const createExcelTemplate = async (categoryId: string): Promise<Blob | null> => {
    const category = getCategoryById(categoryId);
    if (!category) return null;
    
    // Editierbare Attribute für das Excel-Template ermitteln
    const templateAttributes = category.attributes
      .filter(attr => !attr.isCalculated)
      .sort((a, b) => a.order - b.order);
    
    // Excel-Arbeitsmappe erstellen
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CollectODex';
    workbook.created = new Date();
    
    // Hauptarbeitsblatt mit Vorlage
    const templateSheet = workbook.addWorksheet('Vorlagen-Tabelle', {
      properties: { tabColor: { argb: '4F46E5' } }
    });
    
    // Anleitung-Arbeitsblatt
    const instructionSheet = workbook.addWorksheet('Anleitung', {
      properties: { tabColor: { argb: '00B050' } }
    });
    
    // Header-Zeile erstellen
    const headers = templateAttributes.map(attr => attr.name);
    const headerRow = templateSheet.addRow(headers);
    
    // Header formatieren
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '4F46E5' }
      };
      cell.border = {
        bottom: { style: 'thin', color: { argb: '000000' } }
      };
    });
    
    // Spaltenbreiten anpassen
    headers.forEach((header, i) => {
      templateSheet.getColumn(i + 1).width = Math.max(15, header.length + 5);
    });
    
    // Drei Beispielzeilen erstellen
    for (let i = 0; i < 3; i++) {
      const exampleRow = templateAttributes.map(attr => {
        // Realistischere Beispielwerte je nach Attribut-Typ und Name
        if (attr.type === 'number') {
          if (attr.id === 'quantity' || attr.name.toLowerCase().includes('anzahl')) {
            return i + 1;
          } else if (attr.id === 'price' || attr.name.toLowerCase().includes('preis')) {
            return (i + 1) * 19.99;
          } else if (attr.id === 'value' || attr.name.toLowerCase().includes('wert')) {
            return (i + 1) * 24.99;
          } else {
            return i * 10;
          }
        } else if (attr.type === 'boolean') {
          return i % 2 === 0 ? 'Ja' : 'Nein';
        } else if (attr.type === 'date') {
          const date = new Date();
          date.setMonth(date.getMonth() - i);
          return date;
        } else if (attr.type === 'dropdown' && attr.options && attr.options.length > 0) {
          const optionIndex = i % attr.options.length;
          return attr.options[optionIndex];
        } else if (attr.id === 'name' || attr.name.toLowerCase().includes('name')) {
          const beispiele = ['Pikachu', 'Charizard', 'Mewtu'];
          return beispiele[i % beispiele.length];
        } else if (attr.id === 'edition' || attr.name.toLowerCase().includes('edition')) {
          const beispiele = ['Base Set', 'Schwert & Schild', 'Fusion Strike'];
          return beispiele[i % beispiele.length];
        } else if (attr.id === 'language' || attr.name.toLowerCase().includes('sprache')) {
          const beispiele = ['deutsch', 'englisch', 'japanisch'];
          return beispiele[i % beispiele.length];
        } else {
          return `Beispiel ${i+1}`;
        }
      });
      
      const rowObj = templateSheet.addRow(exampleRow);
      rowObj.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'E6F2FF' }
        };
      });
    }
    
    // Eine leere Zeile zum Ausfüllen
    templateSheet.addRow([]);
    
    // Formatierung anwenden
    templateAttributes.forEach((attr, colIndex) => {
      const column = templateSheet.getColumn(colIndex + 1);
      
      if (attr.type === 'number') {
        if (attr.id === 'price' || attr.id === 'value' || attr.id === 'cost' || attr.name.toLowerCase().includes('preis') || attr.name.toLowerCase().includes('wert') || attr.name.toLowerCase().includes('kosten')) {
          column.numFmt = '€#,##0.00;-€#,##0.00';
        } else if (attr.id === 'quantity' || attr.name.toLowerCase().includes('anzahl')) {
          column.numFmt = '0';
        } else {
          column.numFmt = '0.00';
        }
      } else if (attr.type === 'date') {
        column.numFmt = 'dd.mm.yyyy';
      }
    });
    
    // Anleitung-Inhalt
    instructionSheet.columns = [
      { header: 'Anleitung zum Ausfüllen', key: 'instruction', width: 100 }
    ];
    
    instructionSheet.getColumn('instruction').font = { size: 12 };
    
    instructionSheet.addRow(['Dies ist eine Vorlage zum Hinzufügen neuer Einträge zur Kategorie "' + category.name + '".']).font = { bold: true, size: 14 };
    instructionSheet.addRow(['']);
    instructionSheet.addRow(['So verwenden Sie diese Vorlage:']).font = { bold: true };
    instructionSheet.addRow(['1. Tragen Sie Ihre Daten in die leeren Zeilen im Arbeitsblatt "Vorlagen-Tabelle" ein.']);
    instructionSheet.addRow(['2. Sie können beliebig viele Zeilen hinzufügen.']);
    instructionSheet.addRow(['3. Die ersten Zeilen enthalten Beispieldaten, die Sie als Referenz verwenden können.']);
    instructionSheet.addRow(['4. Speichern Sie die Datei und importieren Sie sie in CollectODex zurück.']);
    instructionSheet.addRow(['']);
    instructionSheet.addRow(['Hinweise zum Ausfüllen der Felder:']).font = { bold: true };
    
    // Detaillierte Anleitungen pro Attribut
    templateAttributes.forEach(attr => {
      let typeInfo = '';
      if (attr.type === 'number') {
        if (attr.id === 'quantity' || attr.name.toLowerCase().includes('anzahl')) {
          typeInfo = 'Ganze Zahl (z.B. 1, 2, 3)';
        } else if (attr.id === 'price' || attr.name.toLowerCase().includes('preis') || 
                  attr.id === 'value' || attr.name.toLowerCase().includes('wert') || 
                  attr.id === 'cost' || attr.name.toLowerCase().includes('kosten')) {
          typeInfo = 'Geldbetrag in Euro (z.B. 19.99)';
        } else {
          typeInfo = 'Zahl (z.B. 5.75)';
        }
      } else if (attr.type === 'boolean') {
        typeInfo = 'Ja oder Nein';
      } else if (attr.type === 'date') {
        typeInfo = 'Datum im Format TT.MM.JJJJ (z.B. 15.04.2023)';
      } else if (attr.type === 'dropdown' && attr.options) {
        typeInfo = `Eine der folgenden Optionen: ${attr.options.join(', ')}`;
      } else {
        typeInfo = 'Text';
      }
      
      instructionSheet.addRow([`- ${attr.name}: ${typeInfo}`]);
    });
    
    // Excel-Datei erstellen
    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };
  
  const exportCollectionAsExcel = async (): Promise<Blob | null> => {
    // Excel-Arbeitsmappe erstellen
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CollectODex';
    workbook.created = new Date();
    
    // Übersichts-Arbeitsblatt
    const overviewSheet = workbook.addWorksheet('Übersicht', {
      properties: { tabColor: { argb: '4F46E5' } }
    });
    
    // Header-Zeile für die Übersicht
    overviewSheet.columns = [
      { header: 'Kategorie', key: 'category', width: 30 },
      { header: 'Anzahl', key: 'count', width: 15 },
      { header: 'Gesamtwert', key: 'value', width: 20, style: { numFmt: '€#,##0.00;-€#,##0.00' } },
      { header: 'Gesamtkosten', key: 'cost', width: 20, style: { numFmt: '€#,##0.00;-€#,##0.00' } },
      { header: 'Gewinn/Verlust', key: 'profitLoss', width: 20, style: { numFmt: '€#,##0.00;-€#,##0.00' } }
    ];
    
    // Header formatieren
    overviewSheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '4F46E5' }
      };
      cell.border = {
        bottom: { style: 'thin', color: { argb: '000000' } }
      };
    });
    
    // Datenzeilen für die Übersicht
    categories.forEach(category => {
      const catSummary = summary.categorySummaries[category.id] || { count: 0, value: 0, cost: 0, profitLoss: 0 };
      overviewSheet.addRow({
        category: category.name,
        count: catSummary.count,
        value: catSummary.value,
        cost: catSummary.cost,
        profitLoss: catSummary.profitLoss
      });
    });
    
    // Gesamtzeile für die Übersicht
    const totalRow = overviewSheet.addRow({
      category: 'GESAMT',
      count: summary.totalItems,
      value: summary.totalValue,
      cost: summary.totalCost,
      profitLoss: summary.profitLoss
    });
    
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'E6F2FF' }
      };
      cell.border = {
        top: { style: 'thin', color: { argb: '000000' } }
      };
    });
    
    // Informationsblatt über die Exportgrenzen
    const infoSheet = workbook.addWorksheet('Exportinformationen', {
      properties: { tabColor: { argb: 'FFA500' } } // Orange
    });
    
    infoSheet.columns = [
      { header: 'Information', key: 'info', width: 80 }
    ];
    
    infoSheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFA500' } // Orange
      };
    });
    
    infoSheet.addRow(["Hinweise zum Excel-Export"]);
    infoSheet.addRow(["Diese Excel-Datei enthält alle Textdaten und Links aus Ihrer Sammlung."]);
    infoSheet.addRow(["Beachten Sie jedoch die folgenden Einschränkungen:"]);
    infoSheet.addRow(["1. Bilder werden beim Excel-Export nicht enthalten sein."]);
    infoSheet.addRow(["2. Zellen, die in der Originalsammlung Bilder enthalten, sind mit einer Notiz markiert."]);
    infoSheet.addRow(["3. Für ein vollständiges Backup inkl. aller Bilder nutzen Sie bitte die Option 'Als JSON exportieren'."]);
    infoSheet.addRow(["4. Links werden als Hyperlinks exportiert und sind blau und unterstrichen dargestellt."]);
    infoSheet.addRow(["5. Beim Excel-Import werden Hyperlinks automatisch erkannt und korrekt importiert."]);
    
    infoSheet.getRow(2).font = { bold: true };
    
    // Ein Arbeitsblatt für jede Kategorie erstellen
    categories.forEach(category => {
      const categoryItems = getItemsByCategoryId(category.id);
      if (categoryItems.length === 0) return; // Keine leeren Arbeitsblätter
      
      const worksheet = workbook.addWorksheet(category.name, {
        properties: { tabColor: { argb: '4F46E5' } }
      });
      
      // Sichtbare Attribute für diese Kategorie finden
      const visibleAttributes = category.attributes
        .filter(attr => attr.isVisible)
        .sort((a, b) => a.order - b.order);
      
      // Spalten einrichten
      const columns = visibleAttributes.map(attr => {
        let width = Math.max(15, attr.name.length + 5);
        let numFmt;
        
        if (attr.type === 'number') {
          if (attr.id === 'price' || attr.id === 'value' || attr.id === 'cost' || 
              attr.name.toLowerCase().includes('preis') || attr.name.toLowerCase().includes('wert') || 
              attr.name.toLowerCase().includes('kosten')) {
            numFmt = '€#,##0.00;-€#,##0.00';
          } else if (attr.id === 'quantity' || attr.name.toLowerCase().includes('anzahl')) {
            numFmt = '0';
          } else {
            numFmt = '0.00';
          }
        } else if (attr.type === 'date') {
          numFmt = 'dd.mm.yyyy';
        }
        
        return {
          header: attr.name,
          key: attr.id,
          width,
          style: numFmt ? { numFmt } : {}
        };
      });
      
      worksheet.columns = columns;
      
      // Header formatieren
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '4F46E5' }
        };
        cell.border = {
          bottom: { style: 'thin', color: { argb: '000000' } }
        };
      });
      
      // Daten für jedes Item hinzufügen
      categoryItems.forEach(item => {
        const calculatedValues = calculateItemValue(item);
        const rowData: string[] = [];
        
        visibleAttributes.forEach(attr => {
          let value;
          if (attr.isCalculated) {
            value = calculatedValues[attr.id];
          } else {
            value = item.values[attr.id];
          }
          
          rowData.push(value.toString());
        });
        
        const row = worksheet.addRow(rowData);
        
        // Links und Bildhinweise für jede Zelle prüfen und setzen
        visibleAttributes.forEach((attr, colIndex) => {
          const cell = row.getCell(colIndex + 1);
          
          // Wenn ein Link für dieses Attribut existiert, setze ihn als Hyperlink
          if (item.links && item.links[attr.id]) {
            // Statt direkt hyperlink zu setzen, verwenden wir die richtige Methode
            if (cell.text) {
              // Wenn bereits Text vorhanden ist, verwenden wir diesen
              worksheet.getCell(cell.address).value = {
                text: cell.text,
                hyperlink: item.links[attr.id]
              };
            } else {
              // Sonst verwenden wir die URL als Text
              worksheet.getCell(cell.address).value = {
                text: item.links[attr.id],
                hyperlink: item.links[attr.id]
              };
            }
            cell.font = { color: { argb: '0000FF' }, underline: true };
          }
          
          // Hinweis hinzufügen, wenn ein Bild existiert
          if (item.images && item.images[attr.id]) {
            cell.note = "Enthält Bild (nur beim JSON-Export erhalten)";
            
            // Optionale visuelle Markierung für Zellen mit Bildern
            if (!cell.font) cell.font = {};
            cell.font.italic = true;
            if (!item.links || !item.links[attr.id]) {
              cell.font.color = { argb: '808080' }; // Grau
            }
          }
        });
      });
    });
    
    // Excel-Datei erstellen
    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
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
    importExcel,
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