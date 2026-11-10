/**
 * Storage-Service für CollectODex
 * Abstrahiert die Speichermethoden je nach Laufzeitumgebung (Browser oder Electron)
 */


// Prüfe, ob die App in Electron läuft
const isElectron = () => {
  return 'electronAPI' in window;
};

// Storage Keys
export const STORAGE_KEYS = {
  CATEGORIES: 'pokemon_collection_categories',
  ITEMS: 'pokemon_collection_items',
  VALUE_HISTORY: 'pokemon_collection_value_history',
  BACKUP_SETTINGS: 'collectodex_backup_settings',
  CATALOG_OWNED: 'collectodex_catalog_owned'
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
