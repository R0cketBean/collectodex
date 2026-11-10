// Besitzmarkierungen des Kartenkatalogs: ein kleiner, app-weiter Speicher
// außerhalb des CollectionContext, damit das Abhaken einer Karte nicht die
// (große) Item-Liste neu schreibt.

import { useSyncExternalStore } from 'react';
import * as StorageService from '../services/StorageService';
import { coerceOwnedMap, toggleOwned, type OwnedMap } from '../utils/catalogOwnership';
import type { CatalogVariant } from '../types/models';

let state: OwnedMap = {};
let loadStarted = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

const load = () => {
  if (loadStarted) return;
  loadStarted = true;
  void StorageService.getData<unknown>(StorageService.STORAGE_KEYS.CATALOG_OWNED).then((stored) => {
    state = coerceOwnedMap(stored);
    emit();
  });
};

const persist = () =>
  void StorageService.setData(StorageService.STORAGE_KEYS.CATALOG_OWNED, state).catch(() => undefined);

const subscribe = (listener: () => void) => {
  load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Aktueller Stand, z. B. für das Backup. */
export const getCatalogOwned = (): OwnedMap => state;

/** Ersetzt alle Markierungen (Wiederherstellung aus einem Backup). */
export const replaceCatalogOwned = (next: unknown) => {
  loadStarted = true;
  state = coerceOwnedMap(next);
  persist();
  emit();
};

export const toggleCatalogOwned = (setId: string, cardId: string, variant: CatalogVariant) => {
  state = toggleOwned(state, setId, cardId, variant);
  persist();
  emit();
};

export const useCatalogOwned = (): OwnedMap => useSyncExternalStore(subscribe, getCatalogOwned);
