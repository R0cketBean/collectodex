import { beforeEach, describe, expect, it } from 'vitest';
import { getItemViewMode, setItemViewMode } from './viewMode';

describe('Ansicht je Kategorie', () => {
  beforeEach(() => localStorage.clear());

  it('zeigt ohne Wahl die Tabelle und merkt die Wahl je Kategorie', () => {
    expect(getItemViewMode('singles')).toBe('table');
    setItemViewMode('singles', 'tiles');
    expect(getItemViewMode('singles')).toBe('tiles');
    expect(getItemViewMode('sealed')).toBe('table');
    expect(getItemViewMode(undefined)).toBe('table');
  });

  it('übersteht unbrauchbare gespeicherte Werte', () => {
    localStorage.setItem('collectodex-item-view', '{"singles":"quatsch","graded":"tiles"}');
    expect(getItemViewMode('singles')).toBe('table');
    expect(getItemViewMode('graded')).toBe('tiles');
    localStorage.setItem('collectodex-item-view', 'kein json');
    expect(getItemViewMode('graded')).toBe('table');
  });
});
