import { useCallback, useEffect, useState } from 'react';
import { fetchCard, summarizePricing } from '../services/tcgdex';
import type { CatalogVariant } from '../types/models';
import {
  addToStack,
  parseStack,
  setPrice,
  setQuantity,
  setVariant,
  type NewStackEntry,
  type StackEntry,
} from '../utils/scanStack';

// Stapel des Kartenscanners (#171). Bleibt bis zum Übernehmen oder Leeren
// erhalten, auch über einen Neustart (localStorage dieses Rechners).

const STACK_KEY = 'collectodex_scanner_stack';

const load = (): StackEntry[] => {
  try {
    return parseStack(JSON.parse(localStorage.getItem(STACK_KEY) ?? '[]'));
  } catch {
    return [];
  }
};

export const useScanStack = () => {
  const [stack, setStack] = useState<StackEntry[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STACK_KEY, JSON.stringify(stack));
    } catch {
      // Ohne Speicher lebt der Stapel nur bis zum Schließen.
    }
  }, [stack]);

  // Preise und Reverse-Fassung laden und bei allen Zeilen der Karte eintragen.
  // `refresh`: alte Preise behalten, wenn der Katalog gerade nicht erreichbar ist.
  const loadPrice = useCallback((entry: Pick<StackEntry, 'cardId' | 'lang'>, refresh = false) => {
    fetchCard(entry.cardId, undefined, entry.lang)
      .then((detail) => {
        const p = summarizePricing(detail);
        // Kennt TCGdex (noch) keine Reverse-Fassung, hat Cardmarket oft trotzdem
        // einen Reverse-Preis in den „-holo“-Feldern. Für Karten, die man im
        // Stapel selbst als Reverse markiert, gilt der – aber nur, wenn es
        // keine normale Holo-Fassung gibt, auf die sich die Felder beziehen könnten.
        const cm = detail.pricing?.cardmarket;
        const holoMeansReverse = entry.lang !== 'ja' && !detail.variants?.holo;
        const holo = (v: unknown) => (holoMeansReverse && typeof v === 'number' && v > 0 ? v : null);
        const price = {
          trend: p.trend,
          low: p.low,
          avg30: p.avg30,
          reverseTrend: p.reverseTrend ?? holo(cm?.['trend-holo']) ?? holo(cm?.['avg-holo']),
          reverseLow: p.reverseLow ?? holo(cm?.['low-holo']),
          idProduct: p.idProduct,
        };
        const known = price.trend !== null || price.low !== null;
        // Japanische Sets haben keine Reverse-Holo-Fassungen.
        const hasReverse = entry.lang !== 'ja' && Boolean(detail.variants?.reverse);
        setStack((s) => setPrice(s, entry.cardId, entry.lang, known ? price : null, hasReverse));
      })
      .catch(() => !refresh && setStack((s) => setPrice(s, entry.cardId, entry.lang, null, false)));
  }, []);

  const add = useCallback(
    (entry: NewStackEntry) => {
      setStack((s) => addToStack(s, entry));
      if (entry.hasReverse === undefined || entry.price === undefined) loadPrice(entry);
    },
    [loadPrice]
  );

  // Beim Öffnen die Preise des gespeicherten Stapels auffrischen.
  useEffect(() => {
    const seen = new Set<string>();
    for (const e of load()) {
      const id = `${e.lang}:${e.cardId}`;
      if (!seen.has(id)) {
        seen.add(id);
        loadPrice(e, true);
      }
    }
  }, [loadPrice]);

  return {
    stack,
    add,
    setQuantity: useCallback((key: string, quantity: number) => setStack((s) => setQuantity(s, key, quantity)), []),
    setVariant: useCallback(
      (key: string, variant: CatalogVariant) => setStack((s) => setVariant(s, key, variant)),
      []
    ),
    remove: useCallback((key: string) => setStack((s) => s.filter((e) => e.key !== key)), []),
    removeMany: useCallback((keys: string[]) => setStack((s) => s.filter((e) => !keys.includes(e.key))), []),
    clear: useCallback(() => setStack([]), []),
  };
};
