// Liest eine Cardmarket-Bestellung aus dem Text ihrer PDF („Einkauf #…“).
//
// Cardmarket bietet pro Einkauf eine PDF an. Darin steht oben die Bestellung
// (Nummer, Daten, Artikelwert), darunter je Produktart ein Abschnitt
// („Pokémon Einzelkarten:“) mit einer Tabelle:
//
//   Menge | Name | Nummer | Sprache | Zustand | Set | Seltenheit | Kommentar | Preis
//
// Die PDF-Bibliothek liefert Textstücke mit Position. Zellen kommen meist
// einzeln, benachbarte kurze Zellen manchmal zusammen („DE NM“). Deshalb wird
// je Zeile nicht nach festen Spalten, sondern an Ankern gelesen: vorne die
// Menge, hinten der Preis, dazwischen Sprache und Zustand als bekannte Kürzel.

export interface PdfTextItem {
  page: number;
  x: number;
  y: number;
  str: string;
}

export type OrderLineKind = 'single' | 'sealed';

export interface CardmarketOrderLine {
  /** Abschnitt in der PDF, z. B. „Pokémon Einzelkarten“. */
  section: string;
  kind: OrderLineKind;
  quantity: number;
  name: string;
  /** Kartennummer, wie Cardmarket sie führt („11“, „TG05“). */
  number?: string;
  /** Sprachkürzel von Cardmarket (DE, EN, JP …). */
  language?: string;
  /** Zustandskürzel von Cardmarket (MT, NM, EX, GD, LP, PL, PO). */
  condition?: string;
  /** Set-Kürzel von Cardmarket („BS“, „SVI“). */
  setCode?: string;
  rarity?: string;
  comment?: string;
  /** Preis je Stück. */
  unitPrice: number;
}

export interface CardmarketOrder {
  orderId: string;
  /** Kaufdatum als 'YYYY-MM-DD' (bezahlt, sonst angekommen, sonst versandt). */
  date: string | null;
  seller?: string;
  /** Artikelwert laut Kopf der PDF (ohne Versand). */
  itemValue?: number;
  currency: string;
  lines: CardmarketOrderLine[];
}

const LANGUAGES = new Set(['DE', 'EN', 'FR', 'IT', 'ES', 'PT', 'JP', 'KR', 'RU', 'S-CN', 'T-CN', 'NL', 'PL']);
const CONDITIONS = new Set(['MT', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO']);
const RARITIES = new Set([
  'C', 'U', 'R', 'RH', 'RR', 'RRR', 'DR', 'UR', 'SR', 'SAR', 'AR', 'HR', 'P', 'PR', 'S', 'SSR', 'CHR', 'CSR', 'ACE', 'TR', 'IR', 'SIR', 'HFA', 'RS', 'RB', 'LV', 'L', 'X', 'BREAK', 'GX', 'V', 'VM', 'VS',
]);
const PRICE_RE = /^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\s*(EUR|€|GBP|£|CHF|USD|\$)?$/;

/** „1.234,50 EUR“ → 1234.5; null, wenn es kein Preis ist. */
export const parseEuro = (text: string): number | null => {
  const match = PRICE_RE.exec(text.trim());
  if (!match) return null;
  return Number(`${match[1].replace(/\./g, '')}.${match[2]}`);
};

const currencyOf = (text: string) => {
  const c = /(EUR|€|GBP|£|CHF|USD|\$)\s*$/.exec(text.trim())?.[1] ?? 'EUR';
  return c === '€' ? 'EUR' : c === '£' ? 'GBP' : c === '$' ? 'USD' : c;
};

/** „27.03.2019“ → „2019-03-27“. */
const isoDate = (text: string | undefined): string | null => {
  const match = text ? /(\d{2})\.(\d{2})\.(\d{4})/.exec(text) : null;
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
};

/** Fasst Textstücke zu Zeilen zusammen (gleiche Seite, fast gleiche Höhe), links nach rechts. */
export const groupRows = (items: PdfTextItem[], tolerance = 2): PdfTextItem[][] => {
  const sorted = items
    .filter((i) => i.str.trim() !== '')
    .slice()
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const rows: PdfTextItem[][] = [];
  for (const item of sorted) {
    const row = rows[rows.length - 1];
    if (row && row[0].page === item.page && Math.abs(row[0].y - item.y) <= tolerance) row.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => row.sort((a, b) => a.x - b.x));
};

const rowText = (row: PdfTextItem[]) => row.map((i) => i.str.trim()).join(' ');

/** Eine Abschnittsüberschrift wie „Pokémon Einzelkarten:“ oder „Pokémon Booster:“. */
const sectionTitle = (row: PdfTextItem[]): string | null => {
  const text = rowText(row);
  if (row.length > 2 || !text.endsWith(':') || /\d/.test(text)) return null;
  return text.slice(0, -1).trim();
};

const isSinglesSection = (title: string) => /einzelkarten|singles/i.test(title);

/**
 * Liest eine Tabellenzeile. `null`, wenn die Zeile keine Artikelzeile ist
 * (vorne keine Menge oder hinten kein Preis).
 */
export const parseLine = (row: PdfTextItem[], section: string): CardmarketOrderLine | null => {
  if (row.length < 3) return null;
  const quantityText = row[0].str.trim();
  if (!/^\d{1,4}$/.test(quantityText)) return null;
  // Der Preis steht ganz rechts; „2,50“ und „EUR“ können getrennt kommen.
  let end = row.length - 1;
  let priceText = row[end].str.trim();
  if (/^(EUR|€|GBP|£|CHF|USD|\$)$/.test(priceText) && end > 1) {
    end -= 1;
    priceText = `${row[end].str.trim()} ${priceText}`;
  }
  const unitPrice = parseEuro(priceText);
  if (unitPrice === null) return null;

  const middle = row.slice(1, end);
  if (middle.length === 0) return null;
  const kind: OrderLineKind = isSinglesSection(section) ? 'single' : 'sealed';
  const line: CardmarketOrderLine = { section, kind, quantity: Number(quantityText), name: '', unitPrice };

  // Der Name ist das erste Stück; alles danach wird in Kürzel zerlegt.
  line.name = middle[0].str.trim();
  const tokens = middle.slice(1).flatMap((i) => i.str.trim().split(/\s+/)).filter(Boolean);
  const langIndex = tokens.findIndex((t) => LANGUAGES.has(t));
  if (langIndex === -1) {
    // Ohne erkennbare Sprache: Rest gehört zum Namen (Sealed-Artikel mit langen Namen).
    if (tokens.length > 0) line.comment = tokens.join(' ');
    return line;
  }
  const before = tokens.slice(0, langIndex);
  if (kind === 'single' && before.length > 0 && /\d/.test(before[before.length - 1])) {
    line.number = before.pop();
  }
  if (before.length > 0) line.name = `${line.name} ${before.join(' ')}`;
  line.language = tokens[langIndex];
  let rest = tokens.slice(langIndex + 1);
  if (rest[0] && CONDITIONS.has(rest[0])) {
    line.condition = rest[0];
    rest = rest.slice(1);
  }
  if (kind === 'sealed') {
    // Sealed-Zeilen nennen nach der Sprache das Set-Kürzel („VIV“), dann den Kommentar.
    if (rest[0] && /^[A-Z0-9]{2,6}$/.test(rest[0])) {
      line.setCode = rest[0];
      rest = rest.slice(1);
    }
  } else {
    if (rest[0] && /^[A-Za-z0-9-]{1,8}$/.test(rest[0]) && !RARITIES.has(rest[0])) {
      line.setCode = rest[0];
      rest = rest.slice(1);
    } else if (rest[0] && rest[1] && RARITIES.has(rest[1])) {
      // Set-Kürzel, das zufällig wie eine Seltenheit aussieht („P“-Sets).
      line.setCode = rest[0];
      rest = rest.slice(1);
    }
    if (rest[0] && RARITIES.has(rest[0])) {
      line.rarity = rest[0];
      rest = rest.slice(1);
    }
  }
  if (rest.length > 0) line.comment = rest.join(' ');
  return line;
};

/**
 * Liest die ganze Bestellung. Wirft, wenn der Text nicht nach einer
 * Cardmarket-Bestellung aussieht.
 */
export const parseCardmarketOrder = (items: PdfTextItem[]): CardmarketOrder => {
  const rows = groupRows(items);
  const texts = rows.map(rowText);
  const all = texts.join('\n');
  const orderId = /(?:Einkauf|Purchase|Bestellung|Order)\s*#\s*(\d+)/i.exec(all)?.[1];
  if (!orderId) throw new Error('Keine Cardmarket-Bestellung erkannt (Bestellnummer fehlt).');

  const dateAfter = (label: RegExp) => {
    const m = new RegExp(`(?:${label.source}):\\s*(\\d{2}\\.\\d{2}\\.\\d{4})`, 'i').exec(all);
    return isoDate(m?.[1]);
  };
  const date =
    dateAfter(/(?<!Un)Bezahlt|(?<!Un)Paid/) ?? dateAfter(/Angekommen|Arrived/) ?? dateAfter(/Versandt|Sent|Shipped/);

  const seller = /(?:Verkäufer|Seller)\s*-\s*(\S+)/i.exec(all)?.[1];
  const valueRow = texts.find((t) => /^(Artikelwert|Article value)\b/i.test(t));
  const itemValueText = valueRow?.replace(/^(Artikelwert|Article value)\s*/i, '');
  const itemValue = itemValueText ? parseEuro(itemValueText) ?? undefined : undefined;
  const currency = itemValueText ? currencyOf(itemValueText) : 'EUR';

  const lines: CardmarketOrderLine[] = [];
  let section: string | null = null;
  for (const row of rows) {
    const title = sectionTitle(row);
    if (title && !/^(Verkäufer|Käufer|Seller|Buyer)/i.test(title)) {
      section = title;
      continue;
    }
    if (!section) continue;
    const line = parseLine(row, section);
    if (line) {
      lines.push(line);
    } else if (lines.length > 0 && row[0].x > 20 && !/cardmarket/i.test(rowText(row))) {
      // Umbrochener langer Name: Fortsetzung ohne Menge und Preis.
      const last = lines[lines.length - 1];
      const extra = rowText(row);
      if (extra.length < 80 && !/\d{2}\.\d{2}\.\d{4}/.test(extra)) last.name = `${last.name} ${extra}`;
    }
  }

  // Cardmarket nennt je Zeile den Stückpreis. Passt erst die Summe der
  // Zeilenpreise zum Artikelwert, war es der Zeilenpreis – dann teilen.
  if (itemValue !== undefined && lines.some((l) => l.quantity > 1)) {
    const cents = (n: number) => Math.round(n * 100);
    const unitSum = lines.reduce((s, l) => s + cents(l.unitPrice) * l.quantity, 0);
    const lineSum = lines.reduce((s, l) => s + cents(l.unitPrice), 0);
    if (unitSum !== cents(itemValue) && lineSum === cents(itemValue)) {
      for (const l of lines) l.unitPrice = Math.round((l.unitPrice / l.quantity) * 100) / 100;
    }
  }

  return { orderId, date, seller, itemValue, currency, lines };
};
