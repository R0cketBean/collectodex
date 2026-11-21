// Hält eine begonnene Cardmarket-Vorschau fest, solange die App läuft.
//
// „Zum Eintrag“ wechselt die Seite; ohne diesen Speicher wäre die Vorschau
// danach weg. Die Seite Import/Export stellt sie beim Zurückkommen wieder her,
// das Layout zeigt bis dahin einen Knopf zum Fortsetzen. Nur im Arbeitsspeicher:
// Nach einem Neustart beginnt man neu.

import { useSyncExternalStore } from 'react';
import type { CardmarketOrder } from '../../services/cardmarketOrder';
import type { ImportRow } from '../../utils/cardmarketImport';

export interface PendingImport {
  orders: CardmarketOrder[];
  rows: ImportRow[];
  fileErrors: string[];
}

let pending: PendingImport | null = null;
const listeners = new Set<() => void>();

export const getPendingImport = () => pending;

export const setPendingImport = (next: PendingImport | null) => {
  pending = next;
  for (const l of listeners) l();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const usePendingImport = () => useSyncExternalStore(subscribe, getPendingImport);
