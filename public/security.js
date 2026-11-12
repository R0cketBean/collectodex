// Sicherheitsregeln des Hauptprozesses (#133).
//
// Das Fenster gilt als nicht vertrauenswürdig: Was es über IPC schickt oder
// öffnen will, wird hier geprüft. Dieses Modul enthält bewusst nichts
// Electron-Spezifisches, damit es sich ohne laufende App testen lässt.

// Schlüssel, die das Fenster in der Datendatei lesen und schreiben darf.
// Muss zu STORAGE_KEYS in src/services/StorageService.ts passen – ein Test
// gleicht beide Listen ab.
const ALLOWED_STORE_KEYS = Object.freeze([
  'pokemon_collection_categories',
  'pokemon_collection_items',
  'pokemon_collection_value_history',
  'collectodex_backup_settings',
  'collectodex_catalog_owned',
  'collectodex_catalog_settings',
]);

const isAllowedStoreKey = (key) => typeof key === 'string' && ALLOWED_STORE_KEYS.includes(key);

const parseUrl = (value) => {
  if (typeof value !== 'string') return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

/** Nur https-Adressen dürfen an den Standardbrowser gehen – nie file:, smb: oder App-Schemata. */
const isSafeExternalUrl = (value) => {
  const url = parseUrl(value);
  return url !== null && url.protocol === 'https:';
};

/**
 * Gehört die Adresse zur App selbst? In der gepackten App ist das genau die
 * geladene index.html (Seitenwechsel laufen über den Hash), in der Entwicklung
 * der Vite-Server.
 */
const isAppUrl = (value, appUrl) => {
  const url = parseUrl(value);
  const own = parseUrl(appUrl);
  if (!url || !own || url.protocol !== own.protocol) return false;
  if (own.protocol === 'file:') return url.pathname === own.pathname;
  return url.origin === own.origin;
};

module.exports = { ALLOWED_STORE_KEYS, isAllowedStoreKey, isSafeExternalUrl, isAppUrl };
