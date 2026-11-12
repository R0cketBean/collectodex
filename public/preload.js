const { contextBridge, ipcRenderer } = require('electron');

// Stellen Sie sicher, dass die Electron-API korrekt in den Main-Kontext injiziert wird
contextBridge.exposeInMainWorld('electronAPI', {
  // Lokaler Speicher. Der Hauptprozess lässt nur die bekannten Schlüssel zu
  // (public/security.js); Löschen und Leeren gibt es bewusst nicht.
  storeGet: (key) => ipcRenderer.invoke('store-get', key),
  storeSet: (key, data) => ipcRenderer.invoke('store-set', key, data),

  // Externe Adresse im Standardbrowser öffnen (nur https)
  openExternalURL: (url) => ipcRenderer.invoke('open-external-url', url),

  // Auto-Update (#20): Listener auf die Main-Prozess-Events. Jede Methode gibt
  // eine Cleanup-Funktion zurück, mit der der Listener wieder entfernt wird.
  onUpdateAvailable: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('update:available', handler);
    return () => ipcRenderer.removeListener('update:available', handler);
  },
  onUpdateProgress: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('update:progress', handler);
    return () => ipcRenderer.removeListener('update:progress', handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('update:downloaded', handler);
    return () => ipcRenderer.removeListener('update:downloaded', handler);
  },
  onUpdateError: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('update:error', handler);
    return () => ipcRenderer.removeListener('update:error', handler);
  },
  // "Kein Update vorhanden" — Rückmeldung für die manuelle Prüfung (Settings).
  onUpdateNone: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('update:none', handler);
    return () => ipcRenderer.removeListener('update:none', handler);
  },

  // Vom UpdateNotification-UI ausgelöst: Download starten bzw. installieren.
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  // Manuelle Prüfung aus dem Settings-Tab; liefert { supported } zurück.
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  // Aktuelle App-Version (für die Anzeige im Settings-Tab).
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // Bilder (#120): als Datei ablegen (liefert einen Verweis) bzw. wieder als
  // Data-URL lesen (für Export und Backup).
  saveImage: (dataUrl) => ipcRenderer.invoke('images:save', dataUrl),
  readImage: (ref) => ipcRenderer.invoke('images:read', ref),
  // Vorschaubild zu einem abgelegten Bild speichern (#128); liefert dessen Verweis.
  saveThumbnail: (ref, dataUrl) => ipcRenderer.invoke('images:save-thumb', ref, dataUrl),

  // Auto-Backup (#91)
  chooseBackupFolder: () => ipcRenderer.invoke('backup:choose-folder'),
  writeBackup: (payload) => ipcRenderer.invoke('backup:write', payload),
  openBackupFolder: (folder) => ipcRenderer.invoke('backup:open-folder', folder)
});