// Theme-Verwaltung für den Dark Mode (#93).
//
// Drei Modi: 'light' | 'dark' | 'system'. 'system' folgt der OS-Einstellung
// (prefers-color-scheme) und reagiert live auf deren Wechsel. Die Auswahl
// wird im localStorage gehalten (synchron + im Browser wie in Electron
// verfügbar), damit sie schon VOR dem ersten Render angewandt werden kann und
// es kein helles Aufblitzen gibt.

export type ThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'collectodex-theme';

/** Liest die gespeicherte Auswahl; Default 'system'. */
export const getThemeChoice = (): ThemeChoice => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage nicht verfügbar -> Default
  }
  return 'system';
};

const prefersDark = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

/** Ob bei gegebener Auswahl effektiv der Dark Mode aktiv ist. */
export const isDarkActive = (choice: ThemeChoice = getThemeChoice()): boolean =>
  choice === 'dark' || (choice === 'system' && prefersDark());

/** Wendet die Auswahl auf <html> an (toggelt die 'dark'-Klasse). */
export const applyTheme = (choice: ThemeChoice = getThemeChoice()): void => {
  const root = document.documentElement;
  if (isDarkActive(choice)) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
};

/** Speichert die Auswahl und wendet sie sofort an. */
export const setThemeChoice = (choice: ThemeChoice): void => {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Speichern fehlgeschlagen -> trotzdem anwenden
  }
  applyTheme(choice);
};

// Live auf OS-Wechsel reagieren, solange 'system' gewählt ist. Einmalig beim
// Modul-Import registriert.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if (getThemeChoice() === 'system') {
      applyTheme('system');
    }
  };
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler);
  } else if (typeof mql.addListener === 'function') {
    // ältere Safari/Electron-Versionen
    mql.addListener(handler);
  }
}
