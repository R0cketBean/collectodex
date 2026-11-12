// Einstieg für neue Nutzer (#129): vier Schritte, die sich weitgehend selbst
// abhaken. Die Karte auf dem Dashboard verschwindet, sobald alle erledigt sind
// oder der Nutzer sie ausblendet – bestehende Sammlungen sehen sie also nie.

const STORAGE_KEY = 'collectodex-onboarding';

export interface OnboardingState {
  /** Vom Nutzer ausgeblendet. */
  dismissed: boolean;
  /** Die Kategorienverwaltung wurde aus dem Einstieg heraus geöffnet. */
  categoriesSeen: boolean;
}

export const DEFAULT_ONBOARDING_STATE: OnboardingState = { dismissed: false, categoriesSeen: false };

export const readOnboardingState = (): OnboardingState => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<OnboardingState> | null;
    return { dismissed: raw?.dismissed === true, categoriesSeen: raw?.categoriesSeen === true };
  } catch {
    return DEFAULT_ONBOARDING_STATE;
  }
};

export const writeOnboardingState = (state: OnboardingState): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ohne localStorage gilt die Wahl nur für diese Sitzung.
  }
};

export type OnboardingStepId = 'categories' | 'firstItem' | 'catalog' | 'backup';

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  text: string;
  /** Beschriftung des Links zum Schritt. */
  action: string;
  href: string;
  done: boolean;
}

export interface OnboardingFacts {
  categories: Array<{ id: string; isDefault?: boolean; hidden?: boolean; order: number }>;
  itemCount: number;
  /** Eine Karte im Katalog abgehakt oder ein Eintrag mit dem Katalog verknüpft. */
  catalogUsed: boolean;
  /** Automatische Sicherung eingeschaltet und ein Ordner gewählt. */
  backupReady: boolean;
  categoriesSeen: boolean;
}

/** Wohin „Ersten Eintrag anlegen“ führt: in die erste sichtbare Kategorie, sonst zur Verwaltung. */
export const firstEntryHref = (categories: OnboardingFacts['categories']): string => {
  const first = [...categories].filter((c) => !c.hidden).sort((a, b) => a.order - b.order)[0];
  return first ? `/category/${first.id}` : '/category-management';
};

export const onboardingSteps = (facts: OnboardingFacts): OnboardingStep[] => {
  return [
    {
      id: 'categories',
      title: 'Kategorien ansehen',
      text: 'Sealed-Produkte, gegradete Karten und Einzelkarten sind schon angelegt. Du kannst sie umbenennen, um eigene Felder erweitern oder weitere Kategorien anlegen.',
      action: 'Kategorien verwalten',
      href: '/category-management',
      // Wer schon eigene Kategorien hat, kennt die Verwaltung.
      done: facts.categoriesSeen || facts.categories.some((c) => !c.isDefault),
    },
    {
      id: 'firstItem',
      title: 'Ersten Eintrag anlegen',
      text: 'Name, Kaufpreis und aktueller Wert reichen für den Anfang. Fotos und Links kannst du später ergänzen.',
      action: 'Eintrag anlegen',
      href: firstEntryHref(facts.categories),
      done: facts.itemCount > 0,
    },
    {
      id: 'catalog',
      title: 'Kartenkatalog nutzen',
      text: 'Im Katalog hakst du ab, welche Karten eines Sets du hast, siehst Cardmarket-Preise und übernimmst Karten mit Bild direkt in deine Sammlung.',
      action: 'Zum Kartenkatalog',
      href: '/katalog',
      done: facts.catalogUsed,
    },
    {
      id: 'backup',
      title: 'Sicherung einrichten',
      text: 'Wähle in den Einstellungen einen Ordner, dann legt die App einmal täglich eine Sicherung deiner Sammlung an.',
      action: 'Zu den Einstellungen',
      href: '/settings',
      done: facts.backupReady,
    },
  ];
};

/** Ob die Einstiegskarte gezeigt wird. */
export const showOnboarding = (steps: OnboardingStep[], state: Pick<OnboardingState, 'dismissed'>) =>
  !state.dismissed && steps.some((s) => !s.done);
