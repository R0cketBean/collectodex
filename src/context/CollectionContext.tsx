import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
import { useItems } from '../hooks/useItems';

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

// Provider-Komponente
export const CollectionProvider: React.FC<CollectionProviderProps> = ({ children }) => {
  // State für die Daten
  const [categories, setCategories] = useState<Category[]>([]);

  // Items-Domäne (#18): items-State, Item-CRUD, Bilder/Links, Storage-Sync und
  // Kategorie-Korrektur leben jetzt im useItems-Hook. categories wird lesend
  // übergeben (correctItemCategories prüft die Ziel-Kategorie).
  const {
    items,
    setItems,
    addItem,
    updateItem,
    deleteItem,
    deleteMultipleItems,
    getItemsByCategoryId,
    addImageToItem,
    removeImageFromItem,
    addLinkToItem,
    removeLinkFromItem,
    cleanupItemLinks,
    correctItemCategories,
  } = useItems({ categories });

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