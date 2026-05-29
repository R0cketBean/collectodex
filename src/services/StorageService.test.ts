import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import {
  STORAGE_KEYS,
  getData,
  setData,
  atomicUpdateItem,
} from './StorageService';

// Wir testen zwei Laufzeitumgebungen:
// - "Browser":  isElectron() === false, localStorage wird benutzt
// - "Electron": isElectron() === true,  window.electronAPI.* wird benutzt
//
// jsdom liefert localStorage out-of-the-box; window.electronAPI mocken
// wir per Test.

const KEY = STORAGE_KEYS.ITEMS;

const installElectronAPI = (overrides: Partial<Record<string, any>> = {}) => {
  const storeGet = vi.fn();
  const storeSet = vi.fn().mockResolvedValue(true);
  const api = { storeGet, storeSet, ...overrides };
  (window as any).electronAPI = api;
  return api;
};

const removeElectronAPI = () => {
  delete (window as any).electronAPI;
};

beforeEach(() => {
  localStorage.clear();
  removeElectronAPI();
  // console.error stilllegen, damit die Test-Ausgabe der erwarteten
  // Fehlerpfade nicht im stdout landet
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  removeElectronAPI();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('getData — localStorage-Pfad', () => {
  it('liefert null, wenn kein Eintrag existiert', async () => {
    expect(await getData(KEY)).toBeNull();
  });

  it('liefert den geparsten Eintrag, wenn JSON gültig ist', async () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: '1' }, { id: '2' }]));
    expect(await getData(KEY)).toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('liefert null und loggt, wenn der gespeicherte Inhalt kein gültiges JSON ist', async () => {
    localStorage.setItem(KEY, '{not json');
    expect(await getData(KEY)).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('getData — Electron-Pfad', () => {
  it('ruft electronAPI.storeGet auf und gibt das Resultat zurück', async () => {
    const api = installElectronAPI({
      storeGet: vi.fn().mockResolvedValue([{ id: '42' }]),
    });
    const data = await getData(KEY);
    expect(api.storeGet).toHaveBeenCalledWith(KEY);
    expect(data).toEqual([{ id: '42' }]);
  });

  it('normalisiert undefined aus dem Store auf null', async () => {
    installElectronAPI({ storeGet: vi.fn().mockResolvedValue(undefined) });
    expect(await getData(KEY)).toBeNull();
  });
});

describe('setData', () => {
  it('schreibt JSON in localStorage (Browser-Pfad)', async () => {
    await setData(KEY, [{ id: 'x' }]);
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify([{ id: 'x' }]));
  });

  it('delegiert an electronAPI.storeSet (Electron-Pfad)', async () => {
    const api = installElectronAPI();
    await setData(KEY, [{ id: 'y' }]);
    expect(api.storeSet).toHaveBeenCalledWith(KEY, [{ id: 'y' }]);
    // Wenn Electron benutzt wird, soll NICHT zusätzlich localStorage
    // beschrieben werden
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('serialisiert parallele Aufrufe (sequentielle Verarbeitung)', async () => {
    // Wir kicken drei setData-Aufrufe gleichzeitig ab und warten auf
    // alle. Am Ende muss der letzte gewinnen und localStorage muss
    // konsistent sein.
    await Promise.all([
      setData(KEY, ['first']),
      setData(KEY, ['second']),
      setData(KEY, ['third']),
    ]);
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify(['third']));
  });
});

describe('atomicUpdateItem', () => {
  const seed = (items: Array<Record<string, any>>) =>
    localStorage.setItem(KEY, JSON.stringify(items));

  it('schreibt das aktualisierte Item zurück und liefert true', async () => {
    seed([
      {
        id: 'a',
        categoryId: 'c',
        values: { name: 'Alt' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const ok = await atomicUpdateItem('a', (item) => ({
      ...item,
      values: { name: 'Neu' },
    }));

    expect(ok).toBe(true);
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored[0].values).toEqual({ name: 'Neu' });
    expect(stored[0].updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('liefert false, wenn das Item nicht im Store steckt', async () => {
    seed([]);
    const ok = await atomicUpdateItem('does-not-exist', (item) => item);
    expect(ok).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it('überspringt das Schreiben, wenn die Werte unverändert bleiben (Optimierung)', async () => {
    seed([{ id: 'a', categoryId: 'c', values: { name: 'X' } }]);
    const beforeRaw = localStorage.getItem(KEY);

    const ok = await atomicUpdateItem('a', (item) => ({
      ...item,
      // identischer values-Inhalt
      values: { name: 'X' },
    }));

    expect(ok).toBe(true);
    // localStorage wurde nicht neu beschrieben → Inhalt identisch
    expect(localStorage.getItem(KEY)).toBe(beforeRaw);
  });

  it('serialisiert konkurrierende Updates für dasselbe Item: der zweite Caller piggybacked auf dem ersten', async () => {
    seed([{ id: 'a', categoryId: 'c', values: { count: 0 } }]);

    const updateA = vi.fn((item) => ({
      ...item,
      values: { count: 1 },
    }));
    const updateB = vi.fn((item) => ({
      ...item,
      values: { count: 2 },
    }));

    // Beide Aufrufe gleichzeitig starten — der erste landet zuerst in
    // der Queue, der zweite sieht das laufende Promise und wartet
    // darauf, ohne selbst eine Update-Funktion zu rufen.
    const [okA, okB] = await Promise.all([
      atomicUpdateItem('a', updateA),
      atomicUpdateItem('a', updateB),
    ]);

    expect(okA).toBe(true);
    expect(okB).toBe(true);
    // updateA wurde aufgerufen, updateB nicht
    expect(updateA).toHaveBeenCalledTimes(1);
    expect(updateB).not.toHaveBeenCalled();

    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored[0].values).toEqual({ count: 1 });
  });
});
