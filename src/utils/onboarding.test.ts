import { describe, expect, it } from 'vitest';
import { onboardingSteps, showOnboarding, type OnboardingFacts } from './onboarding';

const fresh: OnboardingFacts = {
  categories: [
    { id: 'sealed', isDefault: true, order: 0 },
    { id: 'graded', isDefault: true, order: 1 },
    { id: 'singles', isDefault: true, order: 2 },
  ],
  itemCount: 0,
  catalogUsed: false,
  backupReady: false,
  categoriesSeen: false,
};

describe('Einstieg für neue Nutzer', () => {
  it('zeigt einer neuen Sammlung vier offene Schritte', () => {
    const steps = onboardingSteps(fresh);
    expect(steps.map((s) => s.id)).toEqual(['categories', 'firstItem', 'catalog', 'backup']);
    expect(steps.every((s) => !s.done)).toBe(true);
    expect(showOnboarding(steps, { dismissed: false })).toBe(true);
  });

  it('führt zum ersten Eintrag in die erste sichtbare Kategorie', () => {
    const hiddenFirst = { ...fresh, categories: [{ id: 'sealed', isDefault: true, hidden: true, order: 0 }, ...fresh.categories.slice(1)] };
    expect(onboardingSteps(fresh)[1].href).toBe('/category/sealed');
    expect(onboardingSteps(hiddenFirst)[1].href).toBe('/category/graded');
    expect(onboardingSteps({ ...fresh, categories: [] })[1].href).toBe('/category-management');
  });

  it('hakt Schritte anhand der Sammlung ab', () => {
    const steps = onboardingSteps({ ...fresh, itemCount: 3, catalogUsed: true });
    expect(steps.filter((s) => s.done).map((s) => s.id)).toEqual(['firstItem', 'catalog']);
    expect(onboardingSteps({ ...fresh, categoriesSeen: true })[0].done).toBe(true);
    expect(onboardingSteps({ ...fresh, categories: [...fresh.categories, { id: 'cat_x', order: 3 }] })[0].done).toBe(true);
  });

  it('bleibt bei eingerichteten Sammlungen und nach dem Ausblenden weg', () => {
    const done = onboardingSteps({ ...fresh, itemCount: 1, catalogUsed: true, backupReady: true, categoriesSeen: true });
    expect(showOnboarding(done, { dismissed: false })).toBe(false);
    expect(showOnboarding(onboardingSteps(fresh), { dismissed: true })).toBe(false);
  });
});
