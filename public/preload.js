const { contextBridge, ipcRenderer } = require('electron');

// Stellen Sie sicher, dass die Electron-API korrekt in den Main-Kontext injiziert wird
contextBridge.exposeInMainWorld('electronAPI', {
  // Methoden zum Zugriff auf den lokalen Speicher
  storeGet: (key) => ipcRenderer.invoke('store-get', key),
  storeSet: (key, data) => ipcRenderer.invoke('store-set', key, data),
  storeDelete: (key) => ipcRenderer.invoke('store-delete', key),
  storeClear: () => ipcRenderer.invoke('store-clear'),
  
  // Methode zum Öffnen von externen URLs im Standardbrowser
  openExternalURL: (url) => ipcRenderer.invoke('open-external-url', url)
}); 