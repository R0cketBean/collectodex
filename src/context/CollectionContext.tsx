import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  Category,
  CollectionItem,
  CollectionSummary,
  AttributeDefinition,
  DEFAULT_CATEGORIES,
  CORE_ATTRIBUTES
} from '../types/models';
import * as StorageService from '../services/StorageService';
import { useImportExport } from '../hooks/useImportExport';
import { useItemValue } from '../hooks/useItemValue';
import { useCollectionSummary } from '../hooks/useCollectionSummary';
import { useItems } from '../hooks/useItems';
import { useCategories } from '../hooks/useCategories';

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

// Migriert die Attribut-Liste einer geladenen Kategorie additiv & idempotent:
// - leere/fehlende Liste -> alle Kern-Attribute (#65)
// - bestehende Liste -> fehlende Kern-Felder ergänzen (z.B. "addedDate", #45)
const migrateCategoryAttributes = (
  attributes: AttributeDefinition[] | undefined
): AttributeDefinition[] => {
  if (!Array.isArray(attributes) || attributes.length === 0) {
    return [...CORE_ATTRIBUTES];
  }
  const existingIds = new Set(attributes.map(attr => attr.id));
  // Nur additiv fehlende Kern-Felder anhängen, die als Standard erwartet werden.
  const missingCore = CORE_ATTRIBUTES.filter(
    core => core.id === 'addedDate' && !existingIds.has(core.id)
  );
  return missingCore.length > 0 ? [...attributes, ...missingCore] : attributes;
};

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

  // Kategorie-Domäne (#18): Kategorie-/Attribut-CRUD, getCategoryById und die
  // Kategorie-Storage-Sync leben im useCategories-Hook. categories/setCategories
  // werden übergeben; setItems, weil deleteCategory kaskadiert und ein
  // Attribut-Typwechsel/-Löschen Item-Werte migriert/bereinigt.
  const {
    getCategoryById,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    addAttributeToCategory,
    updateAttribute,
    deleteAttribute,
  } = useCategories({ categories, setCategories, setItems });

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
            updatedAt: new Date(cat.updatedAt),
            // Attribute migrieren: leere Kategorien mit Kern-Attributen heilen
            // (#65) und bestehende um neue Kern-Felder wie "addedDate" (#45)
            // ergänzen. Additiv und idempotent.
            attributes: migrateCategoryAttributes(cat.attributes)
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