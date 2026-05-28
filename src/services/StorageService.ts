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
  ITEMS: 'pokemon_collection_items'
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

/**
 * Löscht Daten aus dem Speicher
 * @param key Schlüssel, unter dem die Daten gespeichert sind
 */
export const deleteData = async (key: string): Promise<void> => {
  return enqueueUpdate(key, async () => {
    try {
      if (isElectron()) {
        // Electron-Speicher verwenden
        await (window as any).electronAPI.storeDelete(key);
      } else {
        // Browser localStorage verwenden
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error(`Fehler beim Löschen der Daten für ${key}:`, error);
      throw error;
    }
  });
};

/**
 * Löscht alle gespeicherten Daten
 */
export const clearAllData = async (): Promise<void> => {
  return enqueueUpdate('ALL', async () => {
    try {
      if (isElectron()) {
        // Electron-Speicher verwenden
        await (window as any).electronAPI.storeClear();
      } else {
        // Browser localStorage verwenden
        localStorage.clear();
      }
    } catch (error) {
      console.error('Fehler beim Löschen aller Daten:', error);
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

/**
 * Liest ein einzelnes Item aus der Sammlung
 * @param itemId ID des zu lesenden Items
 * @returns Das Item oder null, wenn nicht gefunden
 */
export const getSingleItem = async (itemId: string): Promise<any | null> => {
  try {
    // Wenn ein Update für dieses Item in Bearbeitung ist, warte darauf
    if (itemUpdateQueue.has(itemId)) {
      await itemUpdateQueue.get(itemId);
    }
    
    // Jetzt aktuelle Daten abrufen
    const items = await getData<any[]>(STORAGE_KEYS.ITEMS) || [];
    return items.find(item => item.id === itemId) || null;
  } catch (error) {
    console.error(`Fehler beim Lesen des Items ${itemId}:`, error);
    return null;
  }
};

/**
 * Aktualisiert ein einzelnes Item in der Sammlung
 * Optimierte Version mit verbesserter Zuverlässigkeit und Performance
 * @param itemId ID des zu aktualisierenden Items
 * @param updatedItem Das aktualisierte Item
 * @returns Ein Promise, das true zurückgibt, wenn das Update erfolgreich war
 */
export const updateSingleItem = async (itemId: string, updatedItem: any): Promise<boolean> => {
  try {
    logger.debug(`[StorageService] Aktualisiere Item ${itemId} mit:`, updatedItem);
    
    // Aktuelle Items abrufen
    const currentItems = await getData<any[]>(STORAGE_KEYS.ITEMS) || [];
    logger.debug(`[StorageService] ${currentItems.length} Items im Storage gefunden`);
    
    // Index des zu aktualisierenden Items finden
    const index = currentItems.findIndex(item => item.id === itemId);
    
    if (index === -1) {
      console.error(`[StorageService] Item mit ID ${itemId} nicht gefunden.`);
      return false;
    }
    
    logger.debug(`[StorageService] Item an Position ${index} gefunden`);
    
    // WICHTIG: Erstelle eine tiefe Kopie des Items mit allen Properties
    const itemToSave = JSON.parse(JSON.stringify(updatedItem));
    
    // Stelle sicher, dass Datum-Objekte korrekt serialisiert sind
    if (itemToSave.createdAt instanceof Date) {
      itemToSave.createdAt = itemToSave.createdAt.toISOString();
    }
    
    if (itemToSave.updatedAt instanceof Date) {
      itemToSave.updatedAt = itemToSave.updatedAt.toISOString();
    } else if (typeof itemToSave.updatedAt === 'undefined') {
      // Stelle sicher, dass updatedAt existiert
      itemToSave.updatedAt = new Date().toISOString();
    }
    
    // Die values-Eigenschaft besonders behandeln
    if (!itemToSave.values) {
      itemToSave.values = {}; // Leeres Objekt erstellen, falls nicht vorhanden
    }
    
    // Werte vor dem Speichern ausgeben
    logger.debug(`[StorageService] Zu speichernde Werte für Item ${itemId}:`, itemToSave.values);
    
    // Item in der Liste ersetzen
    currentItems[index] = itemToSave;
    
    // Aktualisierte Liste speichern
    await setData(STORAGE_KEYS.ITEMS, currentItems);
    
    // Verifiziere das gespeicherte Item
    const verifyItems = await getData<any[]>(STORAGE_KEYS.ITEMS) || [];
    const verifiedItem = verifyItems.find(item => item.id === itemId);
    
    if (!verifiedItem) {
      console.error(`[StorageService] Verifizierung fehlgeschlagen: Item ${itemId} nach Speicherung nicht gefunden!`);
      return false;
    }
    
    // Prüfe, ob alle values korrekt gespeichert wurden
    const valuesMatch = JSON.stringify(verifiedItem.values) === JSON.stringify(itemToSave.values);
    
    if (!valuesMatch) {
      console.error(`[StorageService] Verifizierung fehlgeschlagen: Werte stimmen nicht überein!`);
      logger.debug('Gespeicherte Werte:', itemToSave.values);
      logger.debug('Verifizierte Werte:', verifiedItem.values);
    } else {
      logger.debug(`[StorageService] Item ${itemId} erfolgreich aktualisiert und verifiziert`);
    }
    
    return true;
  } catch (error) {
    console.error(`[StorageService] Fehler beim Aktualisieren des Items ${itemId}:`, error);
    return false;
  }
}; 