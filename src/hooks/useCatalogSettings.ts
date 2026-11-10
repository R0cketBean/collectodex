// App-weiter Speicher für die Katalog-Einstellungen (siehe utils/catalogSettings).

import { useSyncExternalStore } from 'react';
import * as StorageService from '../services/StorageService';
import { coerceCatalogSettings, DEFAULT_CATALOG_SETTINGS, type CatalogSettings } from '../utils/catalogSettings';

let state: CatalogSettings = DEFAULT_CATALOG_SETTINGS;
let loadStarted = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const load = () => {
  if (loadStarted) return;
  loadStarted = true;
  void StorageService.getData<unknown>(StorageService.STORAGE_KEYS.CATALOG_SETTINGS).then((stored) => {
    if (stored) {
      state = coerceCatalogSettings(stored);
      emit();
    }
  });
};

const subscribe = (listener: () => void) => {
  load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getCatalogSettings = (): CatalogSettings => state;

export const updateCatalogSettings = (patch: Partial<CatalogSettings>) => {
  loadStarted = true;
  state = coerceCatalogSettings({ ...state, ...patch });
  void StorageService.setData(StorageService.STORAGE_KEYS.CATALOG_SETTINGS, state).catch(() => undefined);
  emit();
};

export const useCatalogSettings = (): CatalogSettings => useSyncExternalStore(subscribe, getCatalogSettings);
