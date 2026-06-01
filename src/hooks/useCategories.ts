// Kategorie-Domäne, herausgelöst aus dem CollectionContext (#18).
// Enthält Kategorie- und Attribut-CRUD, getCategoryById und die Storage-
// Synchronisation der Kategorien. Für diese Single-Context-Stufe bleibt der
// categories-State im Provider und wird (mit setCategories) übergeben; setItems
// wird gebraucht, weil deleteCategory kaskadierend Items löscht und ein
// Attribut-Typwechsel/-Löschen die zugehörigen Item-Werte migriert/bereinigt.

import React, { useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Category, CollectionItem, AttributeDefinition } from '../types/models';
import { logger } from '../utils/logger';
import { coerceValueToType } from '../utils/attributeValues';
import * as StorageService from '../services/StorageService';

interface UseCategoriesDeps {
  categories: Category[];
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  setItems: React.Dispatch<React.SetStateAction<CollectionItem[]>>;
}

export interface CategoriesApi {
  getCategoryById: (id: string) => Category | undefined;
  addCategory: (categoryData: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateCategory: (id: string, categoryData: Partial<Omit<Category, 'id'>>) => void;
  deleteCategory: (id: string) => void;
  reorderCategories: (orderedIds: string[]) => void;
  addAttributeToCategory: (categoryId: string, attribute: Omit<AttributeDefinition, 'id'>) => string;
  updateAttribute: (categoryId: string, attributeId: string, attribute: Partial<AttributeDefinition>) => void;
  deleteAttribute: (categoryId: string, attributeId: string) => void;
}

export function useCategories({
  categories,
  setCategories,
  setItems,
}: UseCategoriesDeps): CategoriesApi {
  // Kategorien bei Änderung im Storage persistieren (Datumsfelder normalisiert).
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

  return {
    getCategoryById,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    addAttributeToCategory,
    updateAttribute,
    deleteAttribute,
  };
}
