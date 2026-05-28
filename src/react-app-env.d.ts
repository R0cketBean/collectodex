/// <reference types="react-scripts" />

interface ElectronAPI {
  storeGet: (key: string) => Promise<any>;
  storeSet: (key: string, data: any) => Promise<void>;
  storeDelete: (key: string) => Promise<void>;
  storeClear: () => Promise<void>;
  openExternalURL: (url: string) => Promise<void>;
}

interface Window {
  electronAPI: ElectronAPI;
}
