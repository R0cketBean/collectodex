import { describe, expect, it } from 'vitest';
import {
  parseCSVRow,
  escapeCSVCell,
  formatCellForCSV,
  exampleCellForAttribute,
  buildCategoryCSV,
  buildCategoryTemplateCSV,
} from './csv';
import type {
  AttributeDefinition,
  Category,
  CollectionItem,
} from '../types/models';

describe('parseCSVRow', () => {
  it('teilt einfache Werte am Komma', () => {
    expect(parseCSVRow('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('behält Kommas innerhalb von Anführungszeichen', () => {
    expect(parseCSVRow('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
  });

  it('interpretiert "" innerhalb eines Anführungszeichen-Felds als wörtliches "', () => {
    expect(parseCSVRow('"a""b"')).toEqual(['a"b']);
  });

  it('liefert leere Strings für leere Felder', () => {
    expect(parseCSVRow('a,,b')).toEqual(['a', '', 'b']);
    expect(parseCSVRow(',a,')).toEqual(['', 'a', '']);
  });

  it('akzeptiert eine leere Zeile als ein leeres Feld', () => {
    expect(parseCSVRow('')).toEqual(['']);
  });

  it('behält Zeilenumbrüche innerhalb von Anführungszeichen', () => {
    expect(parseCSVRow('"a\nb",c')).toEqual(['a\nb', 'c']);
  });
});

describe('escapeCSVCell', () => {
  it('lässt harmlose Strings unverändert', () => {
    expect(escapeCSVCell('Charizard')).toBe('Charizard');
  });

  it('wrapt Strings mit Komma in Anführungszeichen', () => {
    expect(escapeCSVCell('a,b')).toBe('"a,b"');
  });

  it('verdoppelt innere Anführungszeichen und wrapt', () => {
    expect(escapeCSVCell('a"b')).toBe('"a""b"');
  });

  it('wrapt Strings mit Zeilenumbruch', () => {
    expect(escapeCSVCell('a\nb')).toBe('"a\nb"');
  });
});

describe('formatCellForCSV', () => {
  it('liefert leere Zelle für null/undefined', () => {
    expect(formatCellForCSV(null, 'text')).toBe('');
    expect(formatCellForCSV(undefined, 'number')).toBe('');
  });

  it('formatiert Zahlen ohne Anführungszeichen', () => {
    expect(formatCellForCSV(42, 'number')).toBe('42');
    expect(formatCellForCSV(3.14, 'number')).toBe('3.14');
  });

  it('formatiert Booleans als Ja/Nein', () => {
    expect(formatCellForCSV(true, 'boolean')).toBe('Ja');
    expect(formatCellForCSV(false, 'boolean')).toBe('Nein');
  });

  it('formatiert Date-Instanzen als YYYY-MM-DD', () => {
    const d = new Date('2026-05-28T15:00:00.000Z');
    expect(formatCellForCSV(d, 'date')).toBe('2026-05-28');
  });

  it('escapt Strings für CSV-Sicherheit', () => {
    expect(formatCellForCSV('a,b', 'text')).toBe('"a,b"');
    expect(formatCellForCSV('Mint', 'dropdown')).toBe('Mint');
  });
});

describe('exampleCellForAttribute', () => {
  const baseAttr = (overrides: Partial<AttributeDefinition>): AttributeDefinition => ({
    id: 'x',
    name: 'X',
    type: 'text',
    required: false,
    order: 0,
    ...overrides,
  });

  it('liefert "1" für das spezielle quantity-Attribut', () => {
    expect(exampleCellForAttribute(baseAttr({ id: 'quantity', type: 'number' }))).toBe('1');
  });

  it('liefert "0" für andere Zahl-Attribute', () => {
    expect(exampleCellForAttribute(baseAttr({ id: 'purchasePrice', type: 'number' }))).toBe('0');
  });

  it('liefert "Ja" für Boolean', () => {
    expect(exampleCellForAttribute(baseAttr({ type: 'boolean' }))).toBe('Ja');
  });

  it('liefert das erste Dropdown-Element', () => {
    expect(
      exampleCellForAttribute(
        baseAttr({ type: 'dropdown', options: ['Mint', 'Near Mint', 'Played'] })
      )
    ).toBe('Mint');
  });

  it('fällt auf "Beispiel" zurück', () => {
    expect(exampleCellForAttribute(baseAttr({ type: 'text' }))).toBe('Beispiel');
  });
});

// Test-Fixtures für die buildCategory*-Funktionen
const buildCategory = (
  attributes: AttributeDefinition[],
  overrides: Partial<Category> = {}
): Category => ({
  id: 'sealed',
  name: 'Sealed Produkte',
  attributes,
  order: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const attr = (overrides: Partial<AttributeDefinition>): AttributeDefinition => ({
  id: overrides.id ?? 'x',
  name: overrides.name ?? overrides.id ?? 'X',
  type: overrides.type ?? 'text',
  required: overrides.required ?? false,
  isVisible: overrides.isVisible ?? true,
  isCalculated: overrides.isCalculated ?? false,
  order: overrides.order ?? 0,
  ...overrides,
});

describe('buildCategoryCSV', () => {
  it('exportiert Header + Datenzeilen für sichtbare, nicht-berechnete Attribute', () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', type: 'text', order: 0 }),
      attr({ id: 'quantity', name: 'Anzahl', type: 'number', order: 1 }),
      attr({
        id: 'totalCost',
        name: 'Gesamtkosten',
        type: 'number',
        isCalculated: true,
        order: 2,
      }),
    ]);
    const items: CollectionItem[] = [
      {
        id: 'i1',
        categoryId: 'sealed',
        values: { name: 'ETB Scarlet', quantity: 2 },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const result = buildCategoryCSV(category, items);
    expect(result.fileName).toBe('sealed-produkte-export.csv');
    expect(result.content).toBe(['Name,Anzahl', 'ETB Scarlet,2'].join('\n'));
  });

  it('fügt Link- und Bild-Info-Spalten hinzu, wenn Items welche haben', () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', order: 0 }),
    ]);
    const items: CollectionItem[] = [
      {
        id: 'i1',
        categoryId: 'sealed',
        values: { name: 'ETB' },
        links: { name: 'https://example.com' },
        images: { name: 'data:image/png;base64,abc' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const result = buildCategoryCSV(category, items);
    expect(result.content).toBe(
      [
        'Name,Name (Link),Name (Bild-Info)',
        'ETB,https://example.com,Bild verfügbar (nur in JSON-Export)',
      ].join('\n')
    );
  });

  it('escapt Sonderzeichen in Werten', () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', order: 0 }),
    ]);
    const items: CollectionItem[] = [
      {
        id: 'i1',
        categoryId: 'sealed',
        values: { name: 'Card "Special", Limited' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const result = buildCategoryCSV(category, items);
    expect(result.content).toBe(
      ['Name', '"Card ""Special"", Limited"'].join('\n')
    );
  });

  it('slugt den Kategorienamen für den Dateinamen', () => {
    const category = buildCategory(
      [attr({ id: 'name', name: 'Name', order: 0 })],
      { name: 'Gegradete Karten PSA' }
    );
    const result = buildCategoryCSV(category, []);
    expect(result.fileName).toBe('gegradete-karten-psa-export.csv');
  });
});

describe('buildCategoryTemplateCSV', () => {
  it('liefert Header + eine einzige Beispielzeile', () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', type: 'text', order: 0 }),
      attr({ id: 'quantity', name: 'Anzahl', type: 'number', order: 1 }),
      attr({
        id: 'condition',
        name: 'Zustand',
        type: 'dropdown',
        options: ['Mint', 'Near Mint'],
        order: 2,
      }),
    ]);
    const result = buildCategoryTemplateCSV(category);
    expect(result.fileName).toBe('sealed-produkte-template.csv');
    expect(result.content).toBe(
      ['Name,Anzahl,Zustand', 'Beispiel,1,Mint'].join('\n')
    );
  });

  it('lässt berechnete Attribute weg', () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', order: 0 }),
      attr({
        id: 'totalCost',
        name: 'Gesamtkosten',
        isCalculated: true,
        order: 1,
      }),
    ]);
    const result = buildCategoryTemplateCSV(category);
    expect(result.content.split('\n')[0]).toBe('Name');
  });
});
