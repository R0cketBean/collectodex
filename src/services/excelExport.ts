// Excel-Export für CollectODex.
//
// Drei async-Funktionen, die ein `Blob` mit der fertigen .xlsx-Datei
// zurückgeben:
//
//   buildCategoryExcel        — Einzel-Kategorie-Export inkl. Hyperlinks
//                               und Bild-Hinweisen
//   buildCategoryExcelTemplate — Vorlage mit drei Beispielzeilen und
//                                einem zusätzlichen Anleitungs-Tab
//   buildCollectionExcel       — Gesamt-Sammlung mit Übersichtstab,
//                                Exporthinweis-Tab und je einem Tab
//                                pro nicht-leerer Kategorie
//
// Die Funktionen sind pur in dem Sinne, dass sie ihre gesamten Inputs
// (Kategorie, Items, Summary, ein Berechnungs-Callback) als Parameter
// bekommen — sie lesen weder React-State noch StorageService an. Das
// macht sie testbar (ExcelJS lädt das Blob für Assertions zurück) und
// frei davon, ob der Aufrufer Electron-Store oder localStorage benutzt.

import ExcelJS from 'exceljs';
import type {
  AttributeDefinition,
  Category,
  CollectionItem,
  CollectionSummary,
} from '../types/models';

type CalculateValues = (
  item: CollectionItem
) => { [attributeId: string]: any };

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const POKEMON_BLUE = '4F46E5';
const HEADER_TEXT_WHITE = 'FFFFFF';
const HEADER_BORDER_BLACK = '000000';
const EXAMPLE_ROW_BLUE = 'E6F2FF';
const INSTRUCTION_TAB_GREEN = '00B050';
const INFO_TAB_ORANGE = 'FFA500';
const LINK_BLUE = '0000FF';
const IMAGE_HINT_GREY = '808080';

const visibleAttributesSorted = (
  attrs: AttributeDefinition[]
): AttributeDefinition[] =>
  attrs.filter((a) => a.isVisible).sort((a, b) => a.order - b.order);

const editableAttributesSorted = (
  attrs: AttributeDefinition[]
): AttributeDefinition[] =>
  attrs.filter((a) => !a.isCalculated).sort((a, b) => a.order - b.order);

/**
 * Pickt das passende Excel-Zahlenformat für ein Attribut. Currency für
 * Preis/Wert/Kosten-Spalten, Ganzzahl für Anzahl, sonst 0.00 für
 * generische Zahlen und dd.mm.yyyy für Datums-Spalten.
 */
const numFmtForAttribute = (attr: AttributeDefinition): string | undefined => {
  if (attr.type === 'number') {
    const nameLower = attr.name.toLowerCase();
    if (
      attr.id === 'price' ||
      attr.id === 'value' ||
      attr.id === 'cost' ||
      nameLower.includes('preis') ||
      nameLower.includes('wert') ||
      nameLower.includes('kosten')
    ) {
      return '€#,##0.00;-€#,##0.00';
    }
    if (attr.id === 'quantity' || nameLower.includes('anzahl')) {
      return '0';
    }
    return '0.00';
  }
  if (attr.type === 'date') {
    return 'dd.mm.yyyy';
  }
  return undefined;
};

const styleHeaderRow = (row: ExcelJS.Row, bgArgb = POKEMON_BLUE) => {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_TEXT_WHITE } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: bgArgb },
    };
    cell.border = {
      bottom: { style: 'thin', color: { argb: HEADER_BORDER_BLACK } },
    };
  });
};

/**
 * Welcher Link aus item.links gehört zu welcher Spalte? Spiegelt die
 * Logik aus CategoryItemsList.tsx: in der Name-Spalte hat der dedizierte
 * Cardmarket-Produkt-Link (item.links.product) Vorrang vor item.links.name.
 * Für alle anderen Spalten wird wie bisher item.links[attr.id] verwendet.
 *
 * Vor diesem Helper hat der Excel-Export bei Items, deren Link unter
 * 'product' (statt 'name') abgelegt war, gar keinen Hyperlink gesetzt —
 * also genau die Stelle, an der die Export-Links für neu hinzugefügte
 * Items "verschwunden" sind.
 */
const resolveItemLink = (
  item: CollectionItem,
  attr: AttributeDefinition
): string | undefined => {
  if (!item.links) return undefined;
  if (attr.id === 'name' && item.links.product) {
    return item.links.product;
  }
  return item.links[attr.id] || undefined;
};

const applyHyperlinkAndImageHints = (
  worksheet: ExcelJS.Worksheet,
  row: ExcelJS.Row,
  attrs: AttributeDefinition[],
  item: CollectionItem
) => {
  attrs.forEach((attr, colIndex) => {
    const cell = row.getCell(colIndex + 1);
    const link = resolveItemLink(item, attr);

    if (link) {
      const linkText = cell.text || link;
      worksheet.getCell(cell.address).value = {
        text: linkText,
        hyperlink: link,
      };
      cell.font = { color: { argb: LINK_BLUE }, underline: true };
    }

    if (item.images && item.images[attr.id]) {
      cell.note = 'Enthält Bild (nur beim JSON-Export erhalten)';
      if (!cell.font) cell.font = {};
      cell.font.italic = true;
      if (!link) {
        cell.font.color = { argb: IMAGE_HINT_GREY };
      }
    }
  });
};

const applyColumnNumFmts = (
  worksheet: ExcelJS.Worksheet,
  attrs: AttributeDefinition[]
) => {
  attrs.forEach((attr, colIndex) => {
    const numFmt = numFmtForAttribute(attr);
    if (numFmt) {
      worksheet.getColumn(colIndex + 1).numFmt = numFmt;
    }
  });
};

const setColumnWidths = (
  worksheet: ExcelJS.Worksheet,
  headers: string[]
) => {
  headers.forEach((header, i) => {
    worksheet.getColumn(i + 1).width = Math.max(15, header.length + 5);
  });
};

const writeWorkbookToBlob = async (
  workbook: ExcelJS.Workbook
): Promise<Blob> => {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
};

/**
 * Excel-Export für eine einzelne Kategorie.
 */
export const buildCategoryExcel = async (
  category: Category,
  items: CollectionItem[],
  calculateValues: CalculateValues
): Promise<Blob> => {
  const exportAttributes = visibleAttributesSorted(category.attributes);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CollectODex';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(category.name, {
    properties: { tabColor: { argb: POKEMON_BLUE } },
  });

  const headers = exportAttributes.map((attr) => attr.name);
  const headerRow = worksheet.addRow(headers);
  styleHeaderRow(headerRow);
  setColumnWidths(worksheet, headers);

  items.forEach((item) => {
    const calculatedValues = calculateValues(item);
    const rowData: string[] = [];

    exportAttributes.forEach((attr) => {
      const value = attr.isCalculated
        ? calculatedValues[attr.id]
        : item.values[attr.id];
      rowData.push(value !== undefined && value !== null ? value.toString() : '');
    });

    const row = worksheet.addRow(rowData);
    applyHyperlinkAndImageHints(worksheet, row, exportAttributes, item);
  });

  applyColumnNumFmts(worksheet, exportAttributes);

  return writeWorkbookToBlob(workbook);
};

/**
 * Beispielwert für eine Template-Zeile. `rowIndex` (0-basiert) erlaubt
 * je Zeile leicht unterschiedliche Beispiele, sodass das Template lebendig
 * wirkt.
 */
const exampleValueForTemplate = (
  attr: AttributeDefinition,
  rowIndex: number
): string | number | Date => {
  const nameLower = attr.name.toLowerCase();

  if (attr.type === 'number') {
    if (attr.id === 'quantity' || nameLower.includes('anzahl')) {
      return rowIndex + 1;
    }
    if (attr.id === 'price' || nameLower.includes('preis')) {
      return (rowIndex + 1) * 19.99;
    }
    if (attr.id === 'value' || nameLower.includes('wert')) {
      return (rowIndex + 1) * 24.99;
    }
    return rowIndex * 10;
  }
  if (attr.type === 'boolean') {
    return rowIndex % 2 === 0 ? 'Ja' : 'Nein';
  }
  if (attr.type === 'date') {
    const date = new Date();
    date.setMonth(date.getMonth() - rowIndex);
    return date;
  }
  if (attr.type === 'dropdown' && attr.options && attr.options.length > 0) {
    return attr.options[rowIndex % attr.options.length];
  }
  if (attr.id === 'name' || nameLower.includes('name')) {
    return ['Pikachu', 'Charizard', 'Mewtu'][rowIndex % 3];
  }
  if (attr.id === 'edition' || nameLower.includes('edition')) {
    return ['Base Set', 'Schwert & Schild', 'Fusion Strike'][rowIndex % 3];
  }
  if (attr.id === 'language' || nameLower.includes('sprache')) {
    return ['deutsch', 'englisch', 'japanisch'][rowIndex % 3];
  }
  return `Beispiel ${rowIndex + 1}`;
};

const typeHintForInstructionSheet = (attr: AttributeDefinition): string => {
  const nameLower = attr.name.toLowerCase();
  if (attr.type === 'number') {
    if (attr.id === 'quantity' || nameLower.includes('anzahl')) {
      return 'Ganze Zahl (z.B. 1, 2, 3)';
    }
    if (
      attr.id === 'price' ||
      nameLower.includes('preis') ||
      attr.id === 'value' ||
      nameLower.includes('wert') ||
      attr.id === 'cost' ||
      nameLower.includes('kosten')
    ) {
      return 'Geldbetrag in Euro (z.B. 19.99)';
    }
    return 'Zahl (z.B. 5.75)';
  }
  if (attr.type === 'boolean') return 'Ja oder Nein';
  if (attr.type === 'date') {
    return 'Datum im Format TT.MM.JJJJ (z.B. 15.04.2023)';
  }
  if (attr.type === 'dropdown' && attr.options) {
    return `Eine der folgenden Optionen: ${attr.options.join(', ')}`;
  }
  return 'Text';
};

/**
 * Excel-Vorlage für eine Kategorie: ein "Vorlagen-Tabelle"-Tab mit
 * Header, drei Beispielzeilen und einer Leerzeile zum Ausfüllen, plus
 * ein zweiter "Anleitung"-Tab mit feldspezifischen Hinweisen.
 */
export const buildCategoryExcelTemplate = async (
  category: Category
): Promise<Blob> => {
  const templateAttributes = editableAttributesSorted(category.attributes);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CollectODex';
  workbook.created = new Date();

  const templateSheet = workbook.addWorksheet('Vorlagen-Tabelle', {
    properties: { tabColor: { argb: POKEMON_BLUE } },
  });
  const instructionSheet = workbook.addWorksheet('Anleitung', {
    properties: { tabColor: { argb: INSTRUCTION_TAB_GREEN } },
  });

  const headers = templateAttributes.map((attr) => attr.name);
  const headerRow = templateSheet.addRow(headers);
  styleHeaderRow(headerRow);
  setColumnWidths(templateSheet, headers);

  for (let i = 0; i < 3; i++) {
    const exampleRow = templateAttributes.map((attr) =>
      exampleValueForTemplate(attr, i)
    );
    const rowObj = templateSheet.addRow(exampleRow);
    rowObj.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: EXAMPLE_ROW_BLUE },
      };
    });
  }

  templateSheet.addRow([]);

  applyColumnNumFmts(templateSheet, templateAttributes);

  instructionSheet.columns = [
    { header: 'Anleitung zum Ausfüllen', key: 'instruction', width: 100 },
  ];
  instructionSheet.getColumn('instruction').font = { size: 12 };

  instructionSheet.addRow([
    `Dies ist eine Vorlage zum Hinzufügen neuer Einträge zur Kategorie "${category.name}".`,
  ]).font = { bold: true, size: 14 };
  instructionSheet.addRow(['']);
  instructionSheet.addRow(['So verwenden Sie diese Vorlage:']).font = {
    bold: true,
  };
  instructionSheet.addRow([
    '1. Tragen Sie Ihre Daten in die leeren Zeilen im Arbeitsblatt "Vorlagen-Tabelle" ein.',
  ]);
  instructionSheet.addRow(['2. Sie können beliebig viele Zeilen hinzufügen.']);
  instructionSheet.addRow([
    '3. Die ersten Zeilen enthalten Beispieldaten, die Sie als Referenz verwenden können.',
  ]);
  instructionSheet.addRow([
    '4. Speichern Sie die Datei und importieren Sie sie in CollectODex zurück.',
  ]);
  instructionSheet.addRow(['']);
  instructionSheet.addRow(['Hinweise zum Ausfüllen der Felder:']).font = {
    bold: true,
  };

  templateAttributes.forEach((attr) => {
    instructionSheet.addRow([`- ${attr.name}: ${typeHintForInstructionSheet(attr)}`]);
  });

  return writeWorkbookToBlob(workbook);
};

/**
 * Excel-Export für die gesamte Sammlung. Erzeugt ein Übersichts-Tab,
 * ein Exportinformationen-Tab mit Hinweisen zu Bildern/JSON, und je ein
 * Tab pro nicht-leerer Kategorie.
 */
export const buildCollectionExcel = async (
  categories: Category[],
  items: CollectionItem[],
  summary: CollectionSummary,
  calculateValues: CalculateValues
): Promise<Blob> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CollectODex';
  workbook.created = new Date();

  const overviewSheet = workbook.addWorksheet('Übersicht', {
    properties: { tabColor: { argb: POKEMON_BLUE } },
  });

  overviewSheet.columns = [
    { header: 'Kategorie', key: 'category', width: 30 },
    { header: 'Anzahl', key: 'count', width: 15 },
    {
      header: 'Gesamtwert',
      key: 'value',
      width: 20,
      style: { numFmt: '€#,##0.00;-€#,##0.00' },
    },
    {
      header: 'Gesamtkosten',
      key: 'cost',
      width: 20,
      style: { numFmt: '€#,##0.00;-€#,##0.00' },
    },
    {
      header: 'Gewinn/Verlust',
      key: 'profitLoss',
      width: 20,
      style: { numFmt: '€#,##0.00;-€#,##0.00' },
    },
  ];

  styleHeaderRow(overviewSheet.getRow(1));

  categories.forEach((category) => {
    const cat = summary.categorySummaries[category.id] || {
      count: 0,
      value: 0,
      cost: 0,
      profitLoss: 0,
    };
    overviewSheet.addRow({
      category: category.name,
      count: cat.count,
      value: cat.value,
      cost: cat.cost,
      profitLoss: cat.profitLoss,
    });
  });

  const totalRow = overviewSheet.addRow({
    category: 'GESAMT',
    count: summary.totalItems,
    value: summary.totalValue,
    cost: summary.totalCost,
    profitLoss: summary.profitLoss,
  });
  totalRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: EXAMPLE_ROW_BLUE },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: HEADER_BORDER_BLACK } },
    };
  });

  const infoSheet = workbook.addWorksheet('Exportinformationen', {
    properties: { tabColor: { argb: INFO_TAB_ORANGE } },
  });
  infoSheet.columns = [{ header: 'Information', key: 'info', width: 80 }];
  infoSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_TEXT_WHITE } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: INFO_TAB_ORANGE },
    };
  });
  infoSheet.addRow(['Hinweise zum Excel-Export']);
  infoSheet.addRow([
    'Diese Excel-Datei enthält alle Textdaten und Links aus Ihrer Sammlung.',
  ]);
  infoSheet.addRow(['Beachten Sie jedoch die folgenden Einschränkungen:']);
  infoSheet.addRow(['1. Bilder werden beim Excel-Export nicht enthalten sein.']);
  infoSheet.addRow([
    '2. Zellen, die in der Originalsammlung Bilder enthalten, sind mit einer Notiz markiert.',
  ]);
  infoSheet.addRow([
    "3. Für ein vollständiges Backup inkl. aller Bilder nutzen Sie bitte die Option 'Als JSON exportieren'.",
  ]);
  infoSheet.addRow([
    '4. Links werden als Hyperlinks exportiert und sind blau und unterstrichen dargestellt.',
  ]);
  infoSheet.addRow([
    '5. Beim Excel-Import werden Hyperlinks automatisch erkannt und korrekt importiert.',
  ]);
  infoSheet.getRow(2).font = { bold: true };

  categories.forEach((category) => {
    const categoryItems = items.filter((item) => item.categoryId === category.id);
    if (categoryItems.length === 0) return;

    const worksheet = workbook.addWorksheet(category.name, {
      properties: { tabColor: { argb: POKEMON_BLUE } },
    });
    const visibleAttributes = visibleAttributesSorted(category.attributes);

    worksheet.columns = visibleAttributes.map((attr) => ({
      header: attr.name,
      key: attr.id,
      width: Math.max(15, attr.name.length + 5),
      style: numFmtForAttribute(attr) ? { numFmt: numFmtForAttribute(attr) } : {},
    }));

    styleHeaderRow(worksheet.getRow(1));

    categoryItems.forEach((item) => {
      const calculatedValues = calculateValues(item);
      const rowData: string[] = [];

      visibleAttributes.forEach((attr) => {
        const value = attr.isCalculated
          ? calculatedValues[attr.id]
          : item.values[attr.id];
        rowData.push(
          value !== undefined && value !== null ? value.toString() : ''
        );
      });

      const row = worksheet.addRow(rowData);
      applyHyperlinkAndImageHints(worksheet, row, visibleAttributes, item);
    });
  });

  return writeWorkbookToBlob(workbook);
};
