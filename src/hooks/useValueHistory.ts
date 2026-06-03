// Echte Wert-Historie (#26): hält eine Liste täglicher Wert-Snapshots und
// aktualisiert den Eintrag für „heute", sobald die App initialisiert ist und
// sich die Summe ändert. Vergangene Tage bleiben unveränderlich. Daraus
// plottet das Dashboard die tatsächliche Wertentwicklung (statt der früheren
// interpolierten/fabrizierten Kurve).

import { useState, useEffect, useRef } from 'react';
import { CollectionSummary, ValueSnapshot } from '../types/models';
import * as StorageService from '../services/StorageService';

// Maximal vorgehaltene Tage (~2 Jahre) — hält den Storage klein.
const MAX_DAYS = 730;

// Heutiges lokales Datum als 'YYYY-MM-DD'.
const todayKey = (): string => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(
    t.getDate()
  ).padStart(2, '0')}`;
};

interface UseValueHistoryDeps {
  summary: CollectionSummary;
  // true, sobald der initiale Lade-Vorgang abgeschlossen ist — verhindert,
  // dass der Vor-Lade-Nullwert als Snapshot geschrieben wird.
  isInitialized: boolean;
}

export function useValueHistory({
  summary,
  isInitialized,
}: UseValueHistoryDeps): ValueSnapshot[] {
  const [history, setHistory] = useState<ValueSnapshot[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Immer die aktuelle Historie referenzieren, ohne den Upsert-Effekt an
  // `history` zu koppeln (sonst Endlosschleife).
  const historyRef = useRef<ValueSnapshot[]>([]);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // Einmalig aus dem Storage laden.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await StorageService.getData<ValueSnapshot[]>(
        StorageService.STORAGE_KEYS.VALUE_HISTORY
      );
      if (!cancelled) {
        setHistory(Array.isArray(stored) ? stored : []);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // „Heute" upserten, wenn initialisiert + geladen und sich der Wert ändert.
  useEffect(() => {
    if (!isInitialized || !loaded) return;

    const date = todayKey();
    const categories: ValueSnapshot['categories'] = {};
    Object.entries(summary.categorySummaries).forEach(([id, s]) => {
      categories[id] = { value: s.value, cost: s.cost };
    });
    const snapshot: ValueSnapshot = {
      date,
      totalValue: summary.totalValue,
      totalCost: summary.totalCost,
      categories,
    };

    const prev = historyRef.current;
    const existing = prev.find(s => s.date === date);
    // Redundante Schreibvorgänge vermeiden, wenn sich der Tageswert nicht ändert.
    if (
      existing &&
      existing.totalValue === snapshot.totalValue &&
      existing.totalCost === snapshot.totalCost
    ) {
      return;
    }

    const next = [...prev.filter(s => s.date !== date), snapshot]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-MAX_DAYS);

    setHistory(next);
    StorageService.setData(StorageService.STORAGE_KEYS.VALUE_HISTORY, next);
  }, [summary, isInitialized, loaded]);

  return history;
}
