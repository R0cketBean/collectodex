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
import * as StorageService from '../services/StorageService';
import { useImportExport } from '../hooks/useImportExport';
import { useItemValue } from '../hooks/useItemValue';
import { useCollectionSummary } from '../hooks/useCollectionSummary';

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
  reorderCategories: (orderedIds: string[]) => void;
  
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
  importData: (data: { categories: Category[], items: CollectionItem[] }) => void;
  resetToDefaults: () => void;
  
  // Excel-Funktionen
  exportCategoryAsExcel: (categoryId: string) => Promise<Blob | null>;
  createExcelTemplate: (categoryId: string) => Promise<Blob | null>;
  exportCollectionAsExcel: () => Promise<Blob | null>;
  
  // Fehlerkorrekturen
  correctItemCategories: (sourceIdOrItemId: string, targetId: string, isSingleItem?: boolean) => { success: boolean, correctedCount: number, error: string | null };
}

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

  /**
   * Setzt die Reihenfolge der Kategorien anhand der übergebenen ID-Liste
   * und nummeriert `order` lückenlos neu (0,1,2,…). In EINEM State-Update,
   * damit kein Doppel-Update sich gegenseitig überschreibt, und robust
   * gegen vorher kaputte/doppelte order-Werte (#29-Folgefix).
   */
  const reorderCategories = (orderedIds: string[]) => {
    setCategories(prev => {
      const rank = new Map(orderedIds.map((id, i) => [id, i]));
      return prev
        .map(cat => {
          const newOrder = rank.get(cat.id);
          return newOrder === undefined ? cat : { ...cat, order: newOrder };
        })
        .sort((a, b) => a.order - b.order);
    });
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
  
  // Berechnungs-Layer (#18): calculateFormula/calculateItemValue hängen nur
  // an den Kategorien und leben jetzt in einem eigenen Hook.
  const { calculateFormula, calculateItemValue } = useItemValue({ getCategoryById });

  // Abgeleitete Zusammenfassung (#18): wird aus categories + items via
  // calculateItemValue im eigenen Hook berechnet.
  const summary = useCollectionSummary({ categories, items, calculateItemValue });


  // Import/Export/Reset- und Excel-Orchestrierung lebt jetzt in einem
  // eigenen Hook (#14), damit der Context schlanker bleibt und Daten-State
  // von I/O getrennt ist. Die benötigten State-Teile/Setter werden übergeben.
  const {
    exportData,
    importData,
    resetToDefaults,
    exportCategoryAsExcel,
    createExcelTemplate,
    exportCollectionAsExcel,
  } = useImportExport({
    categories,
    items,
    summary,
    setCategories,
    setItems,
    getCategoryById,
    getItemsByCategoryId,
    calculateItemValue,
  });

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
    reorderCategories,
    
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