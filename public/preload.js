const { contextBridge, ipcRenderer } = require('electron');

// Stellen Sie sicher, dass die Electron-API korrekt in den Main-Kontext injiziert wird
contextBridge.exposeInMainWorld('electronAPI', {
  // Methoden zum Zugriff auf den lokalen Speicher
  storeGet: (key) => ipcRenderer.invoke('store-get', key),
  storeSet: (key, data) => ipcRenderer.invoke('store-set', key, data),
  storeDelete: (key) => ipcRenderer.invoke('store-delete', key),
  storeClear: () => ipcRenderer.invoke('store-clear'),
  
  // Methode zum Öffnen von externen URLs im Standardbrowser
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

  // Vom UpdateNotification-UI ausgelöst: Download starten bzw. installieren.
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install')
});