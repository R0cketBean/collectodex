// CSV-Hilfsfunktionen für Export/Import einer Kategorie-Sammlung.
//
// Reine Funktionen ohne Bezug zu React, electron-store oder dem
// CollectionContext. Die Kategorie- und Item-Strukturen aus models.ts
// werden als Input akzeptiert; der Aufrufer kümmert sich um Persistenz
// und Datei-Download.

import type {
  AttributeDefinition,
  Category,
  CollectionItem,
} from '../types/models';

/**
 * Parst eine einzelne CSV-Zeile in ihre einzelnen Felder.
 *
 * Unterstützt:
 * - Felder in doppelten Anführungszeichen (`"a,b"` → `a,b`)
 * - escapte Anführungszeichen innerhalb von Anführungszeichen (`""` → `"`)
 * - Kommas und Zeilenumbrüche in geschützten Feldern
 */
export const parseCSVRow = (row: string): string[] => {
  const result: string[] = [];
  let insideQuotes = false;
  let currentValue = '';

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    const nextChar = i < row.length - 1 ? row[i + 1] : null;

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentValue += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      result.push(currentValue);
      currentValue = '';
    } else {
      currentValue += char;
    }
  }

  result.push(currentValue);
  return result;
};

/**
 * Verpackt einen String in CSV-Anführungszeichen, falls er Kommas,
 * Anführungszeichen oder Zeilenumbrüche enthält. Innere Anführungs-
 * zeichen werden verdoppelt (`"` → `""`).
 */
export const escapeCSVCell = (value: string): string => {
  const escaped = value.replace(/"/g, '""');
  if (
    escaped.includes(',') ||
    escaped.includes('"') ||
    escaped.includes('\n')
  ) {
    return `"${escaped}"`;
  }
  return escaped;
};

/**
 * Formatiert einen Attribut-Wert für die CSV-Ausgabe entsprechend
 * seines Datentyps. Null/undefined wird zu einer leeren Zelle.
 */
export const formatCellForCSV = (
  value: unknown,
  type: AttributeDefinition['type']
): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (type === 'number') {
    return String(value);
  }
  if (type === 'boolean') {
    return value ? 'Ja' : 'Nein';
  }
  if (type === 'date' && value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  return escapeCSVCell(String(value));
};

/**
 * Liefert einen plausiblen Beispielwert für eine Template-Zeile.
 */
export const exampleCellForAttribute = (attr: AttributeDefinition): string => {
  if (attr.type === 'number') {
    return attr.id === 'quantity' ? '1' : '0';
  }
  if (attr.type === 'boolean') {
    return 'Ja';
  }
  if (attr.type === 'date') {
    return new Date().toISOString().split('T')[0];
  }
  if (attr.type === 'dropdown' && attr.options && attr.options.length > 0) {
    return attr.options[0];
  }
  return 'Beispiel';
};

const slugForFilename = (name: string): string =>
  name.replace(/\s+/g, '-').toLowerCase();

const visibleEditableAttributes = (
  attributes: AttributeDefinition[]
): AttributeDefinition[] =>
  attributes
    .filter((attr) => attr.isVisible && !attr.isCalculated)
    .sort((a, b) => a.order - b.order);

/**
 * Baut den vollständigen CSV-Export für eine Kategorie inklusive der
 * Zusatzspalten für Links und Bild-Hinweise.
 */
export const buildCategoryCSV = (
  category: Category,
  items: CollectionItem[]
): { fileName: string; content: string } => {
  const exportAttributes = visibleEditableAttributes(category.attributes);

  const attributesWithLinks = new Set<string>();
  const attributesWithImages = new Set<string>();

  items.forEach((item) => {
    if (item.links) {
      Object.keys(item.links).forEach((attrId) => attributesWithLinks.add(attrId));
    }
    if (item.images) {
      Object.keys(item.images).forEach((attrId) => attributesWithImages.add(attrId));
    }
  });

  const headers: string[] = exportAttributes.map((attr) => attr.name);

  exportAttributes
    .filter((attr) => attributesWithLinks.has(attr.id))
    .forEach((attr) => headers.push(`${attr.name} (Link)`));

  exportAttributes
    .filter((attr) => attributesWithImages.has(attr.id))
    .forEach((attr) => headers.push(`${attr.name} (Bild-Info)`));

  const rows = items.map((item) => {
    const rowData: string[] = [];

    exportAttributes.forEach((attr) => {
      rowData.push(formatCellForCSV(item.values[attr.id], attr.type));
    });

    exportAttributes
      .filter((attr) => attributesWithLinks.has(attr.id))
      .forEach((attr) => {
        rowData.push(item.links?.[attr.id] ?? '');
      });

    exportAttributes
      .filter((attr) => attributesWithImages.has(attr.id))
      .forEach((attr) => {
        rowData.push(
          item.images && item.images[attr.id]
            ? 'Bild verfügbar (nur in JSON-Export)'
            : ''
        );
      });

    return rowData;
  });

  const content = [headers.join(','), ...rows.map((row) => row.join(','))].join(
    '\n'
  );

  return {
    fileName: `${slugForFilename(category.name)}-export.csv`,
    content,
  };
};

/**
 * Baut eine CSV-Template-Datei für eine Kategorie mit einer einzigen
 * Beispielzeile.
 */
export const buildCategoryTemplateCSV = (
  category: Category
): { fileName: string; content: string } => {
  const templateAttributes = category.attributes
    .filter((attr) => !attr.isCalculated)
    .sort((a, b) => a.order - b.order);

  const headers = templateAttributes.map((attr) => attr.name);
  const exampleRow = templateAttributes.map(exampleCellForAttribute);

  const content = [headers.join(','), exampleRow.join(',')].join('\n');

  return {
    fileName: `${slugForFilename(category.name)}-template.csv`,
    content,
  };
};
