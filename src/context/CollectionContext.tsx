import React, { createContext, useContext, useState, useEffect, useRef, useMemo, ReactNode } from 'react';
import {
  Category,
  CollectionItem,
  CollectionSummary,
  AttributeDefinition,
  DEFAULT_CATEGORIES,
  CORE_ATTRIBUTES,
  ValueSnapshot
} from '../types/models';
import * as StorageService from '../services/StorageService';
import { useImportExport } from '../hooks/useImportExport';
import { useItemValue } from '../hooks/useItemValue';
import { useCollectionSummary } from '../hooks/useCollectionSummary';
import { useItems } from '../hooks/useItems';
import { useCategories } from '../hooks/useCategories';
import { useValueHistory } from '../hooks/useValueHistory';

// Typ für den Context
interface CollectionContextType {
  // Daten
  categories: Category[];
  items: CollectionItem[];
  summary: CollectionSummary;
  valueHistory: ValueSnapshot[];
  
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

// Re-Render-Isolation (#18): Statt EINES flachen Contexts wird die Schnittstelle
// in domänen-granulare Contexts aufgeteilt, die aus EINEM Provider gespeist
// werden. So re-rendern Consumer künftig nur noch auf die Daten, die sie
// tatsächlich lesen. Die reinen Daten-Slices ändern sich bei Mutationen, die
// Funktionen werden referenz-stabil gehalten (siehe Provider, latest-ref).
type DerivedValue = Pick<CollectionContextType, 'summary' | 'valueHistory'>;
type CollectionActions = Omit<
  CollectionContextType,
  'categories' | 'items' | 'summary' | 'valueHistory'
>;

const CategoriesContext = createContext<Category[] | undefined>(undefined);
const ItemsContext = createContext<CollectionItem[] | undefined>(undefined);
const DerivedContext = createContext<DerivedValue | undefined>(undefined);
const ActionsContext = createContext<CollectionActions | undefined>(undefined);

// Granulare Selektor-Hooks — Consumer, die nur eine Domäne brauchen, abonnieren
// gezielt diesen Slice und re-rendern nicht mehr bei fremden Änderungen.
export const useCategoriesData = (): Category[] => {
  const ctx = useContext(CategoriesContext);
  if (ctx === undefined) {
    throw new Error('useCategoriesData must be used within a CollectionProvider');
  }
  return ctx;
};

export const useItemsData = (): CollectionItem[] => {
  const ctx = useContext(ItemsContext);
  if (ctx === undefined) {
    throw new Error('useItemsData must be used within a CollectionProvider');
  }
  return ctx;
};

export const useDerived = (): DerivedValue => {
  const ctx = useContext(DerivedContext);
  if (!ctx) {
    throw new Error('useDerived must be used within a CollectionProvider');
  }
  return ctx;
};

export const useCollectionActions = (): CollectionActions => {
  const ctx = useContext(ActionsContext);
  if (!ctx) {
    throw new Error('useCollectionActions must be used within a CollectionProvider');
  }
  return ctx;
};

// Abwärtskompatibler Aggregator: liefert weiterhin die flache Schnittstelle.
// Bestehende Consumer laufen unverändert; neue/migrierte Consumer nutzen die
// granularen Selektor-Hooks oben. Hinweis: Wer diesen Hook nutzt, re-rendert
// (wie bisher) bei jeder Daten-Änderung — die Isolation greift erst nach
// Migration auf die granularen Hooks.
export const useCollection = (): CollectionContextType => {
  const categories = useCategoriesData();
  const items = useItemsData();
  const { summary, valueHistory } = useDerived();
  const actions = useCollectionActions();
  return { categories, items, summary, valueHistory, ...actions };
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
  // true, sobald der initiale Lade-Vorgang abgeschlossen ist (#26: damit die
  // Wert-Historie nicht den Vor-Lade-Nullwert als Snapshot schreibt).
  const [isInitialized, setIsInitialized] = useState(false);

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
      } finally {
        // Initialer Lade-Vorgang abgeschlossen — ab jetzt darf die
        // Wert-Historie Snapshots schreiben (#26).
        setIsInitialized(true);
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

  // Echte Wert-Historie (#26): tägliche Snapshots aus der Summe, im
  // eigenen Hook gehalten und persistiert.
  const valueHistory = useValueHistory({ summary, isInitialized });


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


  // Stabile Actions (#18): Die Domänen-Hooks memoisieren ihre Funktionen nicht;
  // jeder Render erzeugt neue Referenzen. Statt alle Hooks invasiv mit
  // useCallback zu durchziehen, halten wir hier EINE Funktions-Sammlung über
  // das latest-ref-Pattern referenz-stabil: `latest.current` wird bei jedem
  // Render aktualisiert, die exponierten Wrapper bleiben dank `useMemo([], …)`
  // für immer identisch und lesen beim Aufruf stets die aktuelle Closure
  // (→ keine veralteten Daten). So re-rendern reine Actions-Consumer nie mehr
  // wegen Daten-Änderungen.
  const latest = useRef<CollectionActions>(null as unknown as CollectionActions);
  latest.current = {
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
    exportCategoryAsExcel,
    createExcelTemplate,
    exportCollectionAsExcel,
    correctItemCategories,
  };

  const actions = useMemo<CollectionActions>(() => ({
    // Kategorie-Funktionen
    addCategory: (...a) => latest.current.addCategory(...a),
    updateCategory: (...a) => latest.current.updateCategory(...a),
    deleteCategory: (...a) => latest.current.deleteCategory(...a),
    reorderCategories: (...a) => latest.current.reorderCategories(...a),

    // Attribut-Funktionen
    addAttributeToCategory: (...a) => latest.current.addAttributeToCategory(...a),
    updateAttribute: (...a) => latest.current.updateAttribute(...a),
    deleteAttribute: (...a) => latest.current.deleteAttribute(...a),

    // Item-Funktionen
    addItem: (...a) => latest.current.addItem(...a),
    updateItem: (...a) => latest.current.updateItem(...a),
    deleteItem: (...a) => latest.current.deleteItem(...a),
    deleteMultipleItems: (...a) => latest.current.deleteMultipleItems(...a),
    getItemsByCategoryId: (...a) => latest.current.getItemsByCategoryId(...a),
    // setItems ist ein useState-Dispatch und bereits referenz-stabil.
    setItems,

    // Bilder und Links
    addImageToItem: (...a) => latest.current.addImageToItem(...a),
    removeImageFromItem: (...a) => latest.current.removeImageFromItem(...a),
    addLinkToItem: (...a) => latest.current.addLinkToItem(...a),
    removeLinkFromItem: (...a) => latest.current.removeLinkFromItem(...a),
    cleanupItemLinks: (...a) => latest.current.cleanupItemLinks(...a),

    // Berechnung und Werte
    calculateItemValue: (...a) => latest.current.calculateItemValue(...a),
    calculateFormula: (...a) => latest.current.calculateFormula(...a),

    // Datenverwaltung
    exportData: (...a) => latest.current.exportData(...a),
    importData: (...a) => latest.current.importData(...a),
    resetToDefaults: (...a) => latest.current.resetToDefaults(...a),

    // Excel-Funktionen
    exportCategoryAsExcel: (...a) => latest.current.exportCategoryAsExcel(...a),
    createExcelTemplate: (...a) => latest.current.createExcelTemplate(...a),
    exportCollectionAsExcel: (...a) => latest.current.exportCollectionAsExcel(...a),

    // Fehlerkorrekturen
    correctItemCategories: (...a) => latest.current.correctItemCategories(...a),
  }), [setItems]);

  // Abgeleitete Daten als ein memoisierter Slice — ändert sich nur, wenn
  // summary oder valueHistory tatsächlich neu sind.
  const derived = useMemo<DerivedValue>(
    () => ({ summary, valueHistory }),
    [summary, valueHistory]
  );

  // Ein Provider, vier Slices. Datenwerte werden ROH durchgereicht (nicht in ein
  // frisches Objektliteral gewrappt), damit die Referenz-Stabilität — und damit
  // die Render-Isolation — erhalten bleibt.
  return (
    <ActionsContext.Provider value={actions}>
      <CategoriesContext.Provider value={categories}>
        <ItemsContext.Provider value={items}>
          <DerivedContext.Provider value={derived}>
            {children}
          </DerivedContext.Provider>
        </ItemsContext.Provider>
      </CategoriesContext.Provider>
    </ActionsContext.Provider>
  );
};