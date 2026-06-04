/**
 * Storage-Service für CollectODex
 * Abstrahiert die Speichermethoden je nach Laufzeitumgebung (Browser oder Electron)
 */

import { logger } from '../utils/logger';

// Prüfe, ob die App in Electron läuft
const isElectron = () => {
  return 'electronAPI' in window;
};

// Storage Keys
export const STORAGE_KEYS = {
  CATEGORIES: 'pokemon_collection_categories',
  ITEMS: 'pokemon_collection_items',
  VALUE_HISTORY: 'pokemon_collection_value_history',
  BACKUP_SETTINGS: 'collectodex_backup_settings'
};

// Globale Update-Warteschlange - Verhindert konkurrierende Updates der gleichen Resource
type UpdateQueueItem = {
  key: string;
  operation: () => Promise<any>;
};

const updateQueue: UpdateQueueItem[] = [];
let isProcessingQueue = false;

// Funktion zum Hinzufügen eines Updates zur Warteschlange und Starten der Verarbeitung
const enqueueUpdate = (key: string, operation: () => Promise<any>): Promise<any> => {
  return new Promise((resolve, reject) => {
    const wrappedOperation = async () => {
      try {
        const result = await operation();
        resolve(result);
        return result;
      } catch (error) {
        reject(error);
        throw error;
      }
    };
    
    updateQueue.push({ key, operation: wrappedOperation });
    
    if (!isProcessingQueue) {
      processUpdateQueue();
    }
  });
};

// Funktion zur sequentiellen Verarbeitung der Warteschlange
const processUpdateQueue = async () => {
  if (isProcessingQueue || updateQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  try {
    // Nimm das erste Element aus der Warteschlange
    const nextUpdate = updateQueue.shift();
    
    if (nextUpdate) {
      // Führe die Operation aus
      await nextUpdate.operation();
      
      // Kleine Pause, um sicherzustellen, dass Änderungen gespeichert werden
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  } catch (error) {
    console.error('Fehler bei der Verarbeitung der Update-Warteschlange:', error);
  } finally {
    isProcessingQueue = false;
    
    // Wenn weitere Updates in der Warteschlange sind, verarbeite das nächste
    if (updateQueue.length > 0) {
      processUpdateQueue();
    }
  }
};

/**
 * Liest Daten aus dem Speicher
 * @param key Schlüssel, unter dem die Daten gespeichert sind
 * @returns Die gespeicherten Daten oder null, wenn keine vorhanden sind
 */
export const getData = async <T>(key: string): Promise<T | null> => {
  try {
    if (isElectron()) {
      // Electron-Speicher verwenden
      const data = await (window as any).electronAPI.storeGet(key);
      return data || null;
    } else {
      // Browser localStorage verwenden
      const storedData = localStorage.getItem(key);
      return storedData ? JSON.parse(storedData) : null;
    }
  } catch (error) {
    console.error(`Fehler beim Lesen der Daten für ${key}:`, error);
    return null;
  }
};

/**
 * Speichert Daten
 * @param key Schlüssel, unter dem die Daten gespeichert werden sollen
 * @param data Die zu speichernden Daten
 */
export const setData = async <T>(key: string, data: T): Promise<void> => {
  return enqueueUpdate(key, async () => {
    try {
      if (isElectron()) {
        // Electron-Speicher verwenden
        await (window as any).electronAPI.storeSet(key, data);
      } else {
        // Browser localStorage verwenden
        localStorage.setItem(key, JSON.stringify(data));
      }
    } catch (error) {
      console.error(`Fehler beim Speichern der Daten für ${key}:`, error);
      throw error;
    }
  });
};

// Spezielle Warteschlange für Item-Updates
const itemUpdateQueue = new Map<string, Promise<boolean>>();

/**
 * Führt ein atomares Update für ein einzelnes Item durch
 * Garantiert Konsistenz durch sequenzielle Verarbeitung pro Item
 * @param itemId ID des zu aktualisierenden Items
 * @param updateFunction Funktion, die das aktuelle Item als Parameter erhält und das aktualisierte Item zurückgibt
 * @returns Promise<boolean> - true wenn erfolgreich, false bei Fehlern
 */
export const atomicUpdateItem = async (itemId: string, updateFunction: (item: any) => any): Promise<boolean> => {
  // Wenn bereits ein Update für dieses Item läuft, warte darauf
  if (itemUpdateQueue.has(itemId)) {
    logger.debug(`[StorageService] Warte auf bereits laufendes Update für Item ${itemId}`);
    const existingUpdate = itemUpdateQueue.get(itemId);
    return await existingUpdate || false;
  }

  // Neues Update-Promise erstellen
  const updatePromise = new Promise<boolean>(async (resolve) => {
    try {
      logger.debug(`[StorageService] Starte atomares Update für Item ${itemId}`);
      
      // Aktuelle Items aus dem Storage laden
      const currentItems = await getData<any[]>(STORAGE_KEYS.ITEMS) || [];
      
      // Item finden
      const index = currentItems.findIndex(item => item.id === itemId);
      if (index === -1) {
        console.error(`[StorageService] Item ${itemId} nicht gefunden`);
        resolve(false);
        return;
      }
      
      // Das aktuelle Item extrahieren
      const currentItem = currentItems[index];
      
      // Update-Funktion anwenden
      let updatedItem;
      try {
        updatedItem = updateFunction(currentItem);
        
        // Optimierung: Prüfe, ob es wirklich Änderungen gibt
        const currentValues = JSON.stringify(currentItem.values);
        const updatedValues = JSON.stringify(updatedItem.values);
        
        if (currentValues === updatedValues) {
          logger.debug(`[StorageService] Keine Änderungen an Item ${itemId} erkannt, überspringe Update`);
          resolve(true);
          return;
        }
      } catch (e) {
        console.error('[StorageService] Fehler in der atomaren Update-Funktion:', e);
        resolve(false);
        return;
      }
      
      // Stelle sicher, dass updatedAt aktualisiert wird
      if (updatedItem.updatedAt instanceof Date) {
        updatedItem.updatedAt = updatedItem.updatedAt.toISOString();
      } else {
        updatedItem.updatedAt = new Date().toISOString();
      }
      
      // Stelle sicher, dass createdAt konsistent ist
      if (updatedItem.createdAt instanceof Date) {
        updatedItem.createdAt = updatedItem.createdAt.toISOString();
      }
      
      logger.debug(`[StorageService] Atomic update speichert für Item ${itemId}:`, updatedItem.values);
      
      // Das aktualisierte Item in die Liste einfügen
      currentItems[index] = updatedItem;
      
      // Speichern der aktualisierten Liste
      await setData(STORAGE_KEYS.ITEMS, currentItems);
      
      logger.debug(`[StorageService] Atomic update für Item ${itemId} erfolgreich abgeschlossen`);
      resolve(true);
    } catch (error) {
      console.error(`[StorageService] Fehler beim atomaren Update des Items ${itemId}:`, error);
      resolve(false);
    } finally {
      // Entferne dieses Update aus der Warteschlange
      itemUpdateQueue.delete(itemId);
    }
  });

  // Speichere das Update-Promise in der Warteschlange
  itemUpdateQueue.set(itemId, updatePromise);
  
  // Gib das Promise zurück
  return updatePromise;
};
