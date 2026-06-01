import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  buildCategoryExcel,
  buildCategoryExcelTemplate,
  buildCollectionExcel,
} from './excelExport';
import type {
  AttributeDefinition,
  Category,
  CollectionItem,
  CollectionSummary,
} from '../types/models';

// Helper: lädt einen vom Builder gelieferten Blob in ein ExcelJS-
// Workbook zurück, damit wir die produzierte Struktur byte-genau
// inspizieren können.
const loadWorkbook = async (blob: Blob): Promise<ExcelJS.Workbook> => {
  const buffer = await blob.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
};

const attr = (
  overrides: Partial<AttributeDefinition>
): AttributeDefinition => ({
  id: overrides.id ?? 'x',
  name: overrides.name ?? overrides.id ?? 'X',
  type: overrides.type ?? 'text',
  required: overrides.required ?? false,
  isVisible: overrides.isVisible ?? true,
  isCalculated: overrides.isCalculated ?? false,
  order: overrides.order ?? 0,
  ...overrides,
});

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

// Berechnungs-Callback für Tests: identische Werte, keine Formeln.
const noopCalculate = (item: CollectionItem) => ({ ...item.values });

describe('buildCategoryExcel', () => {
  it('erzeugt ein Worksheet mit Kategorie-Name als Tab-Titel', async () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', order: 0 }),
    ]);
    const blob = await buildCategoryExcel(category, [], noopCalculate);

    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    const wb = await loadWorkbook(blob);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Sealed Produkte']);
  });

  it('schreibt sichtbare Attribute als Header in der gewünschten Reihenfolge', async () => {
    const category = buildCategory([
      attr({ id: 'quantity', name: 'Anzahl', type: 'number', order: 1 }),
      attr({ id: 'name', name: 'Name', order: 0 }),
      attr({
        id: 'hidden',
        name: 'Versteckt',
        isVisible: false,
        order: 2,
      }),
    ]);
    const blob = await buildCategoryExcel(category, [], noopCalculate);
    const wb = await loadWorkbook(blob);
    const sheet = wb.getWorksheet(1)!;
    const headerRow = sheet.getRow(1);

    expect(headerRow.getCell(1).value).toBe('Name');
    expect(headerRow.getCell(2).value).toBe('Anzahl');
    // Versteckte Attribute werden weggelassen
    expect(headerRow.getCell(3).value).toBeNull();
  });

  it('schreibt Item-Werte als Datenzeilen', async () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', order: 0 }),
      attr({ id: 'quantity', name: 'Anzahl', type: 'number', order: 1 }),
    ]);
    const items: CollectionItem[] = [
      {
        id: 'a',
        categoryId: 'sealed',
        values: { name: 'ETB Scarlet', quantity: 2 },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'b',
        categoryId: 'sealed',
        values: { name: 'ETB Violet', quantity: 1 },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const blob = await buildCategoryExcel(category, items, noopCalculate);
    const wb = await loadWorkbook(blob);
    const sheet = wb.getWorksheet(1)!;

    expect(sheet.getRow(2).getCell(1).value).toBe('ETB Scarlet');
    expect(sheet.getRow(2).getCell(2).value).toBe('2');
    expect(sheet.getRow(3).getCell(1).value).toBe('ETB Violet');
    expect(sheet.getRow(3).getCell(2).value).toBe('1');
  });

  it('setzt Hyperlinks für Zellen mit Links', async () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', order: 0 }),
    ]);
    const items: CollectionItem[] = [
      {
        id: 'a',
        categoryId: 'sealed',
        values: { name: 'ETB' },
        links: { name: 'https://example.com/etb' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const blob = await buildCategoryExcel(category, items, noopCalculate);
    const wb = await loadWorkbook(blob);
    const sheet = wb.getWorksheet(1)!;
    const cell = sheet.getRow(2).getCell(1);
    const value = cell.value as { text?: string; hyperlink?: string };
    expect(value.hyperlink).toBe('https://example.com/etb');
  });

  // Regression: die Name-Spalte zeigt in der UI den Cardmarket-Link
  // aus item.links.product. Früher hat der Excel-Export nur
  // item.links[attr.id] geprüft und für Items, die ihren Link unter
  // 'product' (statt 'name') gespeichert hatten, gar keinen Hyperlink
  // gesetzt — siehe CategoryItemsList.tsx, das für attr.id==='name'
  // explizit auf links.product zurückfällt.
  it('zieht für die Name-Spalte den Link aus links.product, wenn vorhanden', async () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', order: 0 }),
    ]);
    const items: CollectionItem[] = [
      {
        id: 'a',
        categoryId: 'sealed',
        values: { name: 'ETB Ewige Rivalen' },
        // Kein links.name — der Link sitzt unter links.product
        links: { product: 'https://www.cardmarket.com/de/Pokemon/Products/etb' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const blob = await buildCategoryExcel(category, items, noopCalculate);
    const wb = await loadWorkbook(blob);
    const sheet = wb.getWorksheet(1)!;
    const cell = sheet.getRow(2).getCell(1);
    const value = cell.value as { text?: string; hyperlink?: string };
    expect(value.hyperlink).toBe(
      'https://www.cardmarket.com/de/Pokemon/Products/etb'
    );
  });

  it('bevorzugt für die Name-Spalte links.product gegenüber links.name', async () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', order: 0 }),
    ]);
    const items: CollectionItem[] = [
      {
        id: 'a',
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

    const blob = await buildCategoryExcel(category, items, noopCalculate);
    const wb = await loadWorkbook(blob);
    const sheet = wb.getWorksheet(1)!;
    const cell = sheet.getRow(2).getCell(1);
    const value = cell.value as { text?: string; hyperlink?: string };
    expect(value.hyperlink).toBe('https://example.com/product-link');
  });

  it('setzt Hyperlinks auch für Number-Attribute', async () => {
    const category = buildCategory([
      attr({ id: 'price', name: 'Preis', type: 'number', order: 0 }),
    ]);
    const items: CollectionItem[] = [
      {
        id: 'a',
        categoryId: 'sealed',
        values: { price: 42 },
        links: { price: 'https://example.com/price' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const blob = await buildCategoryExcel(category, items, noopCalculate);
    const wb = await loadWorkbook(blob);
    const sheet = wb.getWorksheet(1)!;
    const cell = sheet.getRow(2).getCell(1);
    const value = cell.value as { text?: string; hyperlink?: string };
    expect(value.hyperlink).toBe('https://example.com/price');
  });

  it('setzt Hyperlinks auch für Zellen mit leerem Wert', async () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', order: 0 }),
    ]);
    const items: CollectionItem[] = [
      {
        id: 'a',
        categoryId: 'sealed',
        values: {},
        links: { name: 'https://example.com/empty' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const blob = await buildCategoryExcel(category, items, noopCalculate);
    const wb = await loadWorkbook(blob);
    const sheet = wb.getWorksheet(1)!;
    const cell = sheet.getRow(2).getCell(1);
    const value = cell.value as { text?: string; hyperlink?: string };
    expect(value.hyperlink).toBe('https://example.com/empty');
  });

  it('setzt Hyperlinks auch für Boolean-Attribute', async () => {
    const category = buildCategory([
      attr({ id: 'sealed', name: 'Sealed', type: 'boolean', order: 0 }),
    ]);
    const items: CollectionItem[] = [
      {
        id: 'a',
        categoryId: 'sealed',
        values: { sealed: true },
        links: { sealed: 'https://example.com/sealed' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const blob = await buildCategoryExcel(category, items, noopCalculate);
    const wb = await loadWorkbook(blob);
    const sheet = wb.getWorksheet(1)!;
    const cell = sheet.getRow(2).getCell(1);
    const value = cell.value as { text?: string; hyperlink?: string };
    expect(value.hyperlink).toBe('https://example.com/sealed');
  });

  it('benutzt den calculateValues-Callback für berechnete Attribute', async () => {
    const category = buildCategory([
      attr({ id: 'quantity', name: 'Anzahl', type: 'number', order: 0 }),
      attr({
        id: 'totalCost',
        name: 'Gesamtkosten',
        type: 'number',
        isCalculated: true,
        order: 1,
      }),
    ]);
    const items: CollectionItem[] = [
      {
        id: 'a',
        categoryId: 'sealed',
        values: { quantity: 3 },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // calculateValues injiziert für totalCost den festen Wert 99
    const calc = (_item: CollectionItem) => ({ totalCost: 99 });
    const blob = await buildCategoryExcel(category, items, calc);
    const wb = await loadWorkbook(blob);
    const sheet = wb.getWorksheet(1)!;
    expect(sheet.getRow(2).getCell(2).value).toBe('99');
  });

  // #64: Auch berechnete Geld-Spalten (Typ 'formula') sollen als Währung
  // formatiert werden; reine Anzahl-Spalten bleiben Ganzzahl.
  it('formatiert berechnete Geld-Spalten (Formel) als Währung', async () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', order: 0 }),
      attr({ id: 'quantity', name: 'Anzahl', type: 'number', order: 1 }),
      attr({
        id: 'totalValue',
        name: 'Gesamtwert',
        type: 'formula',
        isCalculated: true,
        order: 2,
      }),
    ]);
    const items: CollectionItem[] = [
      {
        id: 'a',
        categoryId: 'sealed',
        values: { name: 'X', quantity: 2 },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const calc = (_item: CollectionItem) => ({
      name: 'X',
      quantity: 2,
      totalValue: 1234.5,
    });
    const blob = await buildCategoryExcel(category, items, calc);
    const wb = await loadWorkbook(blob);
    const sheet = wb.getWorksheet(1)!;
    expect(sheet.getColumn(3).numFmt).toBe('€#,##0.00;-€#,##0.00');
    // Anzahl bleibt Ganzzahl
    expect(sheet.getColumn(2).numFmt).toBe('0');
  });
});

describe('buildCategoryExcelTemplate', () => {
  it('legt zwei Sheets an: Vorlagen-Tabelle und Anleitung', async () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', order: 0 }),
    ]);
    const blob = await buildCategoryExcelTemplate(category);
    const wb = await loadWorkbook(blob);
    expect(wb.worksheets.map((w) => w.name).sort()).toEqual([
      'Anleitung',
      'Vorlagen-Tabelle',
    ]);
  });

  it('schreibt drei Beispielzeilen plus eine Leerzeile', async () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', order: 0 }),
      attr({ id: 'quantity', name: 'Anzahl', type: 'number', order: 1 }),
    ]);
    const blob = await buildCategoryExcelTemplate(category);
    const wb = await loadWorkbook(blob);
    const sheet = wb.getWorksheet('Vorlagen-Tabelle')!;
    // Row 1 = Header, Rows 2-4 = drei Beispiele, Row 5 = Leerzeile.
    // ExcelJS rowCount kann je nach Implementierung Leerzeilen
    // zählen oder nicht — wir prüfen die Beispielzeilen direkt.
    expect(sheet.getRow(1).getCell(1).value).toBe('Name');
    expect(sheet.getRow(2).getCell(2).value).toBe(1);
    expect(sheet.getRow(3).getCell(2).value).toBe(2);
    expect(sheet.getRow(4).getCell(2).value).toBe(3);
  });

  it('lässt berechnete Attribute aus der Vorlage weg', async () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', order: 0 }),
      attr({
        id: 'totalCost',
        name: 'Gesamtkosten',
        isCalculated: true,
        order: 1,
      }),
    ]);
    const blob = await buildCategoryExcelTemplate(category);
    const wb = await loadWorkbook(blob);
    const sheet = wb.getWorksheet('Vorlagen-Tabelle')!;
    expect(sheet.getRow(1).getCell(1).value).toBe('Name');
    // 2. Spalte darf nicht "Gesamtkosten" enthalten
    expect(sheet.getRow(1).getCell(2).value).toBeNull();
  });

  it('enthält eine Anleitungszeile pro Attribut auf dem Anleitung-Tab', async () => {
    const category = buildCategory([
      attr({ id: 'name', name: 'Name', order: 0 }),
      attr({ id: 'quantity', name: 'Anzahl', type: 'number', order: 1 }),
    ]);
    const blob = await buildCategoryExcelTemplate(category);
    const wb = await loadWorkbook(blob);
    const sheet = wb.getWorksheet('Anleitung')!;

    // Sammle alle Zellen der ersten Spalte
    const lines: string[] = [];
    sheet.eachRow((row) => {
      const v = row.getCell(1).value;
      if (typeof v === 'string') lines.push(v);
    });
    expect(lines.some((l) => l.includes('- Name:'))).toBe(true);
    expect(lines.some((l) => l.includes('- Anzahl:'))).toBe(true);
  });
});

describe('buildCollectionExcel', () => {
  const summary: CollectionSummary = {
    totalItems: 3,
    totalValue: 100,
    totalCost: 50,
    profitLoss: 50,
    categorySummaries: {
      sealed: {
        name: 'Sealed Produkte',
        count: 2,
        value: 80,
        cost: 40,
        profitLoss: 40,
      },
      graded: {
        name: 'Gegradete Karten',
        count: 1,
        value: 20,
        cost: 10,
        profitLoss: 10,
      },
    },
  };

  const categories: Category[] = [
    buildCategory([attr({ id: 'name', name: 'Name', order: 0 })], {
      id: 'sealed',
    }),
    buildCategory(
      [attr({ id: 'name', name: 'Name', order: 0 })],
      { id: 'graded', name: 'Gegradete Karten' }
    ),
  ];

  const items: CollectionItem[] = [
    {
      id: 's1',
      categoryId: 'sealed',
      values: { name: 'ETB' },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 's2',
      categoryId: 'sealed',
      values: { name: 'Booster Box' },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'g1',
      categoryId: 'graded',
      values: { name: 'Charizard PSA 10' },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it('legt Übersicht, Exportinformationen und pro Kategorie ein Tab an', async () => {
    const blob = await buildCollectionExcel(
      categories,
      items,
      summary,
      noopCalculate
    );
    const wb = await loadWorkbook(blob);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Übersicht',
      'Exportinformationen',
      'Sealed Produkte',
      'Gegradete Karten',
    ]);
  });

  it('überspringt leere Kategorien beim Erstellen der Tabs', async () => {
    const onlySealedItems = items.filter(
      (item) => item.categoryId === 'sealed'
    );
    const blob = await buildCollectionExcel(
      categories,
      onlySealedItems,
      summary,
      noopCalculate
    );
    const wb = await loadWorkbook(blob);
    // Gegradete Karten ist leer → kein Tab
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Übersicht',
      'Exportinformationen',
      'Sealed Produkte',
    ]);
  });

  it('schreibt Pro-Kategorie- und Gesamt-Zeilen ins Übersichts-Tab', async () => {
    const blob = await buildCollectionExcel(
      categories,
      items,
      summary,
      noopCalculate
    );
    const wb = await loadWorkbook(blob);
    const overview = wb.getWorksheet('Übersicht')!;

    expect(overview.getRow(2).getCell(1).value).toBe('Sealed Produkte');
    expect(overview.getRow(2).getCell(2).value).toBe(2);
    expect(overview.getRow(2).getCell(3).value).toBe(80);
    expect(overview.getRow(3).getCell(1).value).toBe('Gegradete Karten');
    expect(overview.getRow(4).getCell(1).value).toBe('GESAMT');
    expect(overview.getRow(4).getCell(2).value).toBe(3);
    expect(overview.getRow(4).getCell(3).value).toBe(100);
  });

  // Regression: derselbe links.product-Fallback wie beim Einzel-Kategorie-
  // Export muss auch im Gesamt-Sammlungs-Export greifen, sonst fehlen
  // Hyperlinks in den per-Kategorie-Tabs.
  it('benutzt links.product für die Name-Spalte in den Kategorie-Tabs', async () => {
    const itemsWithProductLink: CollectionItem[] = [
      {
        id: 's1',
        categoryId: 'sealed',
        values: { name: 'ETB Ewige Rivalen' },
        links: {
          product: 'https://www.cardmarket.com/de/Pokemon/Products/etb-ewige',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const minimalSummary: CollectionSummary = {
      totalItems: 1,
      totalValue: 0,
      totalCost: 0,
      profitLoss: 0,
      categorySummaries: {
        sealed: {
          name: 'Sealed Produkte',
          count: 1,
          value: 0,
          cost: 0,
          profitLoss: 0,
        },
      },
    };

    const blob = await buildCollectionExcel(
      [categories[0]],
      itemsWithProductLink,
      minimalSummary,
      noopCalculate
    );
    const wb = await loadWorkbook(blob);
    const sheet = wb.getWorksheet('Sealed Produkte')!;
    const cell = sheet.getRow(2).getCell(1);
    const value = cell.value as { text?: string; hyperlink?: string };
    expect(value.hyperlink).toBe(
      'https://www.cardmarket.com/de/Pokemon/Products/etb-ewige'
    );
  });
});
