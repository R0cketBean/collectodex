// Abgeleitete Sammlungs-Zusammenfassung, herausgelöst aus dem
// CollectionContext (#18). Der Hook besitzt den summary-State und leitet ihn
// aus categories + items (via calculateItemValue) ab. Das ist die Basis des
// späteren SummaryContext und hält die Berechnung aus dem Context heraus.

import { useState, useEffect } from 'react';
import { Category, CollectionItem, CollectionSummary } from '../types/models';

const initialSummary: CollectionSummary = {
  totalItems: 0,
  totalValue: 0,
  totalCost: 0,
  profitLoss: 0,
  categorySummaries: {},
};

interface UseCollectionSummaryDeps {
  categories: Category[];
  items: CollectionItem[];
  calculateItemValue: (item: CollectionItem) => { [key: string]: any };
}

export function useCollectionSummary({
  categories,
  items,
  calculateItemValue,
}: UseCollectionSummaryDeps): CollectionSummary {
  const [summary, setSummary] = useState<CollectionSummary>(initialSummary);

  // Berechne die Zusammenfassung, wenn sich Daten ändern
  useEffect(() => {
    const calculateSummary = () => {
      const newSummary: CollectionSummary = {
        totalItems: 0,
        totalValue: 0,
        totalCost: 0,
        profitLoss: 0,
        categorySummaries: {},
      };

      // Initialisiere Kategoriezusammenfassungen
      categories.forEach(category => {
        newSummary.categorySummaries[category.id] = {
          name: category.name,
          count: 0,
          value: 0,
          cost: 0,
          profitLoss: 0,
        };
      });

      // Berechne Werte für jedes Item
      items.forEach(item => {
        // Skip, wenn Kategorie nicht existiert
        if (!newSummary.categorySummaries[item.categoryId]) return;

        const category = categories.find(c => c.id === item.categoryId);
        if (!category) return;

        // Berechne alle Formeln für das Item
        const calculatedValues = calculateItemValue(item);

        // Hole berechnete Werte oder Standardwerte
        const totalValue = typeof calculatedValues.totalValue === 'number'
          ? calculatedValues.totalValue
          : 0;

        const totalCost = typeof calculatedValues.totalCost === 'number'
          ? calculatedValues.totalCost
          : 0;

        const profitLoss = totalValue - totalCost;

        // Aktualisiere Kategoriezusammenfassung
        newSummary.categorySummaries[item.categoryId].count += 1;
        newSummary.categorySummaries[item.categoryId].value += totalValue;
        newSummary.categorySummaries[item.categoryId].cost += totalCost;
        newSummary.categorySummaries[item.categoryId].profitLoss += profitLoss;

        // Aktualisiere Gesamtzusammenfassung
        newSummary.totalItems += 1;
        newSummary.totalValue += totalValue;
        newSummary.totalCost += totalCost;
        newSummary.profitLoss += profitLoss;
      });

      setSummary(newSummary);
    };

    calculateSummary();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, items]); // calculateItemValue als implizite Abhängigkeit, wird durch ESLint-Regel deaktiviert

  return summary;
}
