import { describe, expect, it } from 'vitest';
import {
  parseCSVRow,
  splitCSVRows,
  escapeCSVCell,
  formatCellForCSV,
  exampleCellForAttribute,
  buildCategoryCSV,
  buildCategoryTemplateCSV,
  parseDecimal,
} from './csv';

describe('parseDecimal', () => {
  it('parst deutsche Dezimalzahlen mit Komma (Regression #31)', () => {
    expect(parseDecimal('1,50')).toBe(1.5);
    expect(parseDecimal('12,99')).toBe(12.99);
    expect(parseDecimal('0,01')).toBe(0.01);
  });

  it('parst englische Dezimalzahlen mit Punkt', () => {
    expect(parseDecimal('1.50')).toBe(1.5);
    expect(parseDecimal('12.99')).toBe(12.99);
  });

  it('parst Ganzzahlen', () => {
    expect(parseDecimal('1000')).toBe(1000);
    expect(parseDecimal('0')).toBe(0);
  });

  it('versteht deutsches Format mit Tausender- und Dezimaltrennzeichen', () => {
    expect(parseDecimal('1.234,56')).toBe(1234.56);
    expect(parseDecimal('1.000.000,00')).toBe(1000000);
  });

  it('versteht englisches Format mit Tausender- und Dezimaltrennzeichen', () => {
    expect(parseDecimal('1,234.56')).toBe(1234.56);
    expect(parseDecimal('1,000,000.00')).toBe(1000000);
  });

  it('behandelt mehrere Kommas/Punkte als Tausendertrennzeichen', () => {
    expect(parseDecimal('1,000,000')).toBe(1000000);
    expect(parseDecimal('1.000.000')).toBe(1000000);
  });

  it('liefert NaN für leere oder ungültige Werte', () => {
    expect(parseDecimal('')).toBeNaN();
    expect(parseDecimal('   ')).toBeNaN();
    expect(parseDecimal('abc')).toBeNaN();
  });

  it('Round-Trip: ein per parseFloat zerstörter Wert bleibt jetzt erhalten', () => {
    expect(parseFloat('1,50')).toBe(1);
    expect(parseDecimal('1,50')).toBe(1.5);
  });
});
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

describe('splitCSVRows', () => {
  it('teilt eine einfache Mehrzeilen-CSV an \\n', () => {
    expect(splitCSVRows('a,b\nc,d')).toEqual(['a,b', 'c,d']);
  });

  it('behält \\n innerhalb eines gequoteten Felds', () => {
    expect(splitCSVRows('a,"b\nc"\nd,e')).toEqual(['a,"b\nc"', 'd,e']);
  });

  it('behandelt CRLF wie LF', () => {
    expect(splitCSVRows('a,b\r\nc,d\r\n')).toEqual(['a,b', 'c,d']);
  });

  it('behält CRLF innerhalb gequoteter Felder', () => {
    expect(splitCSVRows('"a\r\nb",c\nd,e')).toEqual(['"a\r\nb",c', 'd,e']);
  });

  it('respektiert verdoppelte Anführungszeichen innerhalb gequoteter Felder', () => {
    // Eine gequotete Zelle "a""b\nc" mit \n drin — die "" darf nicht als
    // Feld-Ende interpretiert werden, sonst würde der \n die Zeile trennen.
    expect(splitCSVRows('"a""b\nc",d\ne,f')).toEqual([
      '"a""b\nc",d',
      'e,f',
    ]);
  });

  it('verwirft trailing leere Zeile', () => {
    expect(splitCSVRows('a,b\nc,d\n')).toEqual(['a,b', 'c,d']);
  });

  it('behält Zeilen mit leeren Feldern', () => {
    expect(splitCSVRows('a,,b\n,c,')).toEqual(['a,,b', ',c,']);
  });

  it('liefert leeres Array für leeren String', () => {
    expect(splitCSVRows('')).toEqual([]);
  });

  it('Round-Trip parseCSVRow auf jeder gesplitteten Zeile liefert die Originalwerte', () => {
    const csv = 'Name,Note\n"Karton hat\nKnick",ok\n"Foo",bar';
    const rows = splitCSVRows(csv);
    expect(rows).toHaveLength(3);
    expect(parseCSVRow(rows[0])).toEqual(['Name', 'Note']);
    expect(parseCSVRow(rows[1])).toEqual(['Karton hat\nKnick', 'ok']);
    expect(parseCSVRow(rows[2])).toEqual(['Foo', 'bar']);
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

  // Regression: dieselbe links.product-Spezialregel wie im Excel-Export.
  // Vorher hat csv.ts attributesWithLinks aus Object.keys(item.links)
  // befüllt und in der Datenzeile item.links[attr.id] gelesen — Items,
  // deren Link nur unter links.product saß, kamen ohne "Name (Link)"-
  // Spalte und ohne URL durch den Export.
  it('liest für die Name-Spalte den Link aus links.product, wenn nur dort vorhanden', () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', order: 0 }),
    ]);
    const items: CollectionItem[] = [
      {
        id: 'i1',
        categoryId: 'sealed',
        values: { name: 'ETB Ewige Rivalen' },
        // kein links.name — der Link sitzt unter links.product
        links: { product: 'https://www.cardmarket.com/de/Pokemon/Products/etb' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const result = buildCategoryCSV(category, items);
    expect(result.content).toBe(
      [
        'Name,Name (Link)',
        'ETB Ewige Rivalen,https://www.cardmarket.com/de/Pokemon/Products/etb',
      ].join('\n')
    );
  });

  it('bevorzugt für die Name-Spalte links.product gegenüber links.name', () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', order: 0 }),
    ]);
    const items: CollectionItem[] = [
      {
        id: 'i1',
        categoryId: 'sealed',
        values: { name: 'X' },
        links: {
          name: 'https://example.com/old-name-link',
          product: 'https://example.com/product-link',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const result = buildCategoryCSV(category, items);
    expect(result.content).toBe(
      ['Name,Name (Link)', 'X,https://example.com/product-link'].join('\n')
    );
  });

  it('legt keine Link-Spalte an, wenn nur fremde links-Keys gesetzt sind', () => {
    // Item hat links.product, aber die Kategorie kennt 'product' nicht und
    // 'name' ist auch nicht in der Kategorie → keine Link-Spalte.
    const category = buildCategory([
      attr({ id: 'quantity', name: 'Anzahl', type: 'number', order: 0 }),
    ]);
    const items: CollectionItem[] = [
      {
        id: 'i1',
        categoryId: 'sealed',
        values: { quantity: 1 },
        links: { product: 'https://example.com/p' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const result = buildCategoryCSV(category, items);
    expect(result.content).toBe(['Anzahl', '1'].join('\n'));
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
