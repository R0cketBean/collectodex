// Berechnungs-Layer, herausgelöst aus dem CollectionContext (#18).
// calculateItemValue wertet die berechneten ("isCalculated") Attribute einer
// Kategorie für ein Item aus; calculateFormula delegiert an die reine
// Formel-Auswertung in utils/formula. Beide hängen nur an den Kategorien
// (Attribut-Definitionen) und bilden später die Basis des DerivedContext.

import { Category, CollectionItem } from '../types/models';
import { evaluateFormula } from '../utils/formula';

interface UseItemValueDeps {
  getCategoryById: (id: string) => Category | undefined;
}

export interface ItemValueApi {
  calculateFormula: (formula: string, values: { [key: string]: any }) => any;
  calculateItemValue: (item: CollectionItem) => { [key: string]: any };
}

export function useItemValue({ getCategoryById }: UseItemValueDeps): ItemValueApi {
  // Delegiert an die reine Formel-Auswertung in src/utils/formula.ts
  // (kann jetzt unabhängig vom React-Kontext getestet werden).
  const calculateFormula = (
    formula: string,
    values: { [key: string]: any }
  ): any => evaluateFormula(formula, values);

  const calculateItemValue = (item: CollectionItem): { [key: string]: any } => {
    const category = getCategoryById(item.categoryId);
    if (!category) return item.values;

    // Kopiere die aktuellen Werte
    const calculatedValues = { ...item.values };

    // Finde berechnete Attribute
    const calculatedAttributes = category.attributes.filter(attr => attr.isCalculated);

    // Berechne jedes berechnete Attribut
    calculatedAttributes.forEach(attr => {
      if (attr.formula) {
        calculatedValues[attr.id] = calculateFormula(attr.formula, calculatedValues);
      }
    });

    return calculatedValues;
  };

  return { calculateFormula, calculateItemValue };
}
