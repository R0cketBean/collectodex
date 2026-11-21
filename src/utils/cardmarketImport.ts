// Abgleich von Cardmarket-Bestellungen mit Katalog und Sammlung.
//
// Je Bestellzeile entsteht ein Vorschlag, den der Nutzer in der Vorschau
// bestätigt oder ändert. Still geändert wird nichts:
//   - Karte noch nicht in der Sammlung → neu anlegen
//   - Karte vorhanden, ohne Kaufpreis  → Kaufpreis eintragen
//   - Karte vorhanden, mit Kaufpreis   → überspringen (Vorgabe), wahlweise
//                                        Anzahl erhöhen oder neu anlegen
//   - Zeile aus dieser Bestellung schon übernommen → überspringen
// Als Kaufpreis gilt der reine Artikelpreis ohne Versand.

import { v4 as uuidv4 } from 'uuid';
import type { CardmarketOrder, CardmarketOrderLine } from '../services/cardmarketOrder';
import type { CatalogLang, CatalogRef, Category, CollectionItem } from '../types/models';
import { isCardCategory, itemProductLink, normalizeName } from './catalogMatch';
import { recordValue } from './valueTrail';
import { rarityInfo } from './cardmarketRarity';

// --- Kürzel von Cardmarket -------------------------------------------------

const LANGUAGE_WORDS: Record<string, string> = {
  DE: 'deutsch',
  EN: 'englisch',
  JP: 'japanisch',
  FR: 'französisch',
  IT: 'italienisch',
  ES: 'spanisch',
  PT: 'portugiesisch',
  KR: 'koreanisch',
};

const CONDITION_WORDS: Record<string, string> = {
  MT: 'Mint',
  NM: 'Near Mint',
  EX: 'Excellent',
  GD: 'Good',
  LP: 'Played',
  PL: 'Played',
  PO: 'Poor',
};

/**
 * Vergleichsschlüssel für Sealed-Namen: Produktarten vereinheitlicht („ETB“ =
 * „Top-Trainer-Box“ = „Elite Trainer Box“), Sprachzusätze weggelassen, Wörter
 * sortiert. „ETB Farbenschock“ und „Farbenschock Top-Trainer-Box“ sind gleich.
 */
const SEALED_SYNONYMS: Array<[RegExp, string]> = [
  [/\b(elite[\s-]*trainer[\s-]*box(es)?|top[\s-]*trainer[\s-]*box(en)?|etb)\b/g, ' etb '],
  [/\bbooster[\s-]*bundles?\b/g, ' bundle '],
  [/\b(booster[\s-]*box(es)?|displays?)\b/g, ' display '],
  [/\bmini[\s-]*tins?\b/g, ' minitin '],
  [/\btin[\s-]*box(es|en)?\b/g, ' tin '],
  [/\b(kollektion|collection)\b/g, ' collection '],
  [/&/g, ' und '],
];
const SEALED_IGNORED = new Set(['eng', 'en', 'de', 'dt', 'jp', 'ja', 'deutsch', 'englisch', 'japanisch', 'pokemon', 'ovp', 'sealed']);

export const sealedKey = (name: string): string => {
  let s = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const [re, to] of SEALED_SYNONYMS) s = s.replace(re, to);
  const tokens = s.split(/[^a-z0-9ß]+/).filter((t) => t && !SEALED_IGNORED.has(t));
  return [...new Set(tokens)].sort().join(' ');
};

/** Produktart für das Feld „Kategorie“ der Sealed-Produkte, aus Abschnitt und Name. */
export const sealedType = (section: string, name: string): string | undefined => {
  const text = `${section} ${name}`.toLowerCase();
  if (/mini[\s-]*tin/.test(text)) return 'Mini Tin Box';
  if (/elite trainer|top-trainer|\betb\b/.test(text)) return 'Elite Trainer Box';
  if (/bundle/.test(text)) return 'Boosterbundle';
  if (/display|booster box/.test(text)) return 'Display';
  if (/blister/.test(text)) return 'Blister';
  if (/\btins?\b|tin-box/.test(text)) return 'Tin Box';
  if (/theme deck|themendeck/.test(text)) return 'Theme Deck';
  if (/box set|collection|kollektion/.test(text)) return 'Box Sets';
  if (/booster/.test(text)) return 'Booster';
  return undefined;
};

/** Katalogsprache zum Sprachkürzel: Deutsch und Japanisch haben eigene Kataloge, sonst Englisch. */
export const catalogLangOf = (language: string | undefined): CatalogLang =>
  language === 'JP' ? 'ja' : language === 'DE' || !language ? 'de' : 'en';

/** Passende Auswahloption eines Dropdowns (ohne Groß/Klein), sonst der Text selbst. */
const option = (word: string | undefined, options: string[] | undefined): string => {
  if (!word) return '';
  if (!options || options.length === 0) return word;
  return options.find((o) => o.toLowerCase() === word.toLowerCase()) ?? word;
};

export const languageWord = (code: string | undefined) => (code ? LANGUAGE_WORDS[code] ?? code : undefined);
export const conditionWord = (code: string | undefined) => (code ? CONDITION_WORDS[code] ?? code : undefined);

// --- Katalogkarte finden ---------------------------------------------------

export interface CatalogHit {
  cardId: string;
  localId: string;
  name: string;
  setId: string;
  setName: string;
  lang: CatalogLang;
  image?: string;
  /** „sure“: Set, Nummer und Name passen; „review“: nur Set und Nummer. */
  status: 'sure' | 'review';
}

export interface CatalogLookup {
  setsByCode: (code: string, lang: CatalogLang) => Promise<Array<{ id: string; name: string }>>;
  setCards: (
    setId: string,
    lang: CatalogLang
  ) => Promise<{ name: string; cards: Array<{ id: string; localId: string; name: string; image?: string }> }>;
}

/** „011“ = „11“, „tg05“ = „TG5“: Großbuchstaben, ohne führende Nullen in Zahlen. */
export const normalizeNumber = (n: string) => n.toUpperCase().replace(/(^|\D)0+(?=\d)/g, '$1');

const namesAgree = (a: string, b: string) => {
  const x = normalizeName(a);
  const y = normalizeName(b);
  return x !== '' && y !== '' && (x === y || x.includes(y) || y.includes(x));
};

/**
 * Sucht die Katalogkarte zu einer Einzelkarten-Zeile über Set-Kürzel und
 * Nummer. Ein Kürzel kann zu mehreren Sets gehören („BS“: Grundset und
 * Kampfstile) – dann entscheidet der Name.
 */
export async function resolveCatalogCard(
  line: CardmarketOrderLine,
  lookup: CatalogLookup
): Promise<CatalogHit | null> {
  if (line.kind !== 'single' || !line.setCode || !line.number) return null;
  const lang = catalogLangOf(line.language);
  const sets = await lookup.setsByCode(line.setCode, lang).catch(() => []);
  const number = normalizeNumber(line.number);
  const byNumber: CatalogHit[] = [];
  for (const set of sets) {
    const detail = await lookup.setCards(set.id, lang).catch(() => null);
    const card = detail?.cards.find((c) => normalizeNumber(c.localId) === number);
    if (!card) continue;
    byNumber.push({
      cardId: card.id,
      localId: card.localId,
      name: card.name,
      setId: set.id,
      setName: detail?.name ?? set.name,
      lang,
      image: card.image,
      status: namesAgree(card.name, line.name) ? 'sure' : 'review',
    });
  }
  const sure = byNumber.filter((h) => h.status === 'sure');
  if (sure.length === 1) return sure[0];
  if (sure.length > 1) return { ...sure[0], status: 'review' };
  return byNumber.length === 1 ? byNumber[0] : null;
}

// --- Vorhandene Einträge ---------------------------------------------------

export const SINGLES_CATEGORY_ID = 'singles';
export const SEALED_CATEGORY_ID = 'sealed';

/**
 * Zielkategorie einer Zeile: Einzelkarten bzw. Sealed Produkte, sonst die erste
 * passende (Karten-)Kategorie.
 */
export const targetCategory = (categories: Category[], line: CardmarketOrderLine): Category | undefined => {
  const preferred = line.kind === 'single' ? SINGLES_CATEGORY_ID : SEALED_CATEGORY_ID;
  return (
    categories.find((c) => c.id === preferred) ??
    categories.find((c) => (line.kind === 'single' ? isCardCategory(c) : !isCardCategory(c)))
  );
};

const itemLang = (item: CollectionItem): CatalogLang => item.catalog?.lang ?? 'de';

/** Set-Kürzel und Nummer am Ende des Cardmarket-Links („BS12“), normalisiert; sonst null. */
const linkCode = (item: CollectionItem): string | null => {
  const path = /\/Singles\/[^/?#]+\/([^/?#]+)/.exec(itemProductLink(item) ?? '')?.[1];
  const last = path?.split('-').pop();
  return last && /\d/.test(last) && !/^V\d+$/i.test(last) ? normalizeNumber(last) : null;
};

/** Ob der Link des Eintrags auf die 1. Edition zeigt. */
export const isFirstEditionLink = (item: CollectionItem) => /[?&]isFirstEd=Y\b/.test(itemProductLink(item) ?? '');

/** Das Ja/Nein-Feld „1. Edition“ einer Kategorie, falls angelegt. */
export const firstEditionAttr = (category: Pick<Category, 'attributes'> | undefined) =>
  (category?.attributes ?? []).find(
    (a) => a.type === 'boolean' && /(^|\s)(1\.?\s*ed(ition)?|first\s*ed(ition)?|erstauflage)/i.test(a.name)
  );

/** Ein Feld für die Seltenheit („Seltenheit“, „Rarity“), falls angelegt. */
export const rarityAttr = (category: Pick<Category, 'attributes'> | undefined) =>
  (category?.attributes ?? []).find((a) => a.type !== 'boolean' && /seltenheit|rarit/i.test(a.name));

/** Ob die Zeile eine Reverse-Holo-Fassung ist. */
export const lineIsReverse = (line: CardmarketOrderLine) => Boolean(line.flags?.reverseHolo);

/** Fassung und Edition eines vorhandenen Eintrags. */
export const itemEdition = (item: CollectionItem, category?: Pick<Category, 'attributes'>) => {
  const attr = firstEditionAttr(category);
  const name = String(item.values?.name ?? '');
  return {
    reverse: item.catalog ? item.catalog.variant === 'reverse' : /reverse/i.test(name),
    firstEdition: (attr ? item.values?.[attr.id] === true : false) || isFirstEditionLink(item) || /1\.\s*ed|first ed/i.test(name),
  };
};

/** Sucht den Eintrag, zu dem die Zeile gehört. */
export const findExisting = (
  items: CollectionItem[],
  categories: Category[],
  line: CardmarketOrderLine,
  hit: CatalogHit | null
): CollectionItem | null => {
  const condition = conditionWord(line.condition)?.toLowerCase();
  const cents = Math.round(line.unitPrice * 100);
  const reverse = lineIsReverse(line);
  const firstEd = Boolean(line.flags?.firstEdition);
  const categoryOf = (i: CollectionItem) => categories.find((c) => c.id === i.categoryId);
  // Gleiche Fassung und Edition zuerst, dann gleicher Kaufpreis, dann gleicher Zustand.
  const score = (i: CollectionItem) => {
    const e = itemEdition(i, categoryOf(i));
    return (
      (e.reverse === reverse ? 8 : 0) +
      (e.firstEdition === firstEd ? 4 : 0) +
      (Math.round((Number(i.values?.purchasePrice) || 0) * 100) === cents ? 2 : 0) +
      (String(i.values?.condition ?? '').toLowerCase() === condition ? 1 : 0)
    );
  };
  const prefer = (list: CollectionItem[]) =>
    list.length === 0 ? null : list.reduce((best, i) => (score(i) > score(best) ? i : best), list[0]);

  if (hit) {
    // Normal und Reverse Holo sind im Katalog verschiedene Fassungen derselben Karte.
    const linked = items.filter(
      (i) =>
        i.catalog?.cardId === hit.cardId &&
        itemLang(i) === hit.lang &&
        (i.catalog.variant === 'reverse') === reverse
    );
    if (linked.length > 0) return prefer(linked);
  }
  // Ohne Katalogtreffer bzw. bei nicht verknüpften Einträgen: Name, Sprache und
  // (bei Karten) die Erweiterung müssen passen.
  const categoryIds = new Set(
    categories.filter((c) => (line.kind === 'single' ? isCardCategory(c) : !isCardCategory(c))).map((c) => c.id)
  );
  const name = normalizeName(line.name);
  const sealed = sealedKey(line.name);
  const lang = languageWord(line.language)?.toLowerCase();
  const code = line.kind === 'single' && line.setCode && line.number ? normalizeNumber(`${line.setCode}${line.number}`) : null;
  const byCode: CollectionItem[] = [];
  const byName: CollectionItem[] = [];
  for (const i of items) {
    if (!categoryIds.has(i.categoryId) || i.catalog) continue;
    const itemLanguage = String(i.values?.language ?? '').toLowerCase();
    if (lang && itemLanguage && itemLanguage !== lang) continue;
    // Der Cardmarket-Link endet auf Set-Kürzel und Nummer („…/Ninetales-V1-BS12“):
    // dasselbe Paar wie in der Bestellung, unabhängig davon, wie die Erweiterung heißt.
    if (code && linkCode(i) === code) {
      byCode.push(i);
      continue;
    }
    if (line.kind === 'sealed') {
      if (sealedKey(String(i.values?.name ?? '')) === sealed) byName.push(i);
      continue;
    }
    if (normalizeName(String(i.values?.name ?? '')) !== name) continue;
    // Ohne passenden Link muss die Erweiterung zum Katalogset passen.
    const expansion = normalizeName(String(i.values?.expansion ?? ''));
    if (!hit || !expansion || expansion !== normalizeName(hit.setName)) continue;
    byName.push(i);
  }
  return prefer(byCode.length > 0 ? byCode : byName);
};

// --- Vergleich Eintrag ↔ Rechnung -----------------------------------------

/** Felder, die sich aus der Rechnung in einen vorhandenen Eintrag übernehmen lassen. */
export type FieldKey =
  | 'name'
  | 'purchasePrice'
  | 'addedDate'
  | 'quantity'
  | 'language'
  | 'condition'
  | 'variant'
  | 'firstEdition'
  | 'rarity'
  | 'catalog';

export interface FieldDiff {
  key: FieldKey;
  label: string;
  /** Anzeige des Werts im Eintrag („–“ wenn leer). */
  current: string;
  /** Anzeige des Werts laut Rechnung. */
  incoming: string;
  /** Wert, der beim Übernehmen gesetzt wird. */
  value: unknown;
  /** Eintrag und Rechnung stimmen schon überein. */
  equal: boolean;
  /** Im Eintrag ist noch nichts eingetragen. */
  empty: boolean;
  /** Lässt sich übernehmen; sonst nur ein Hinweis (z. B. Fassung ohne Katalogverknüpfung). */
  pickable?: boolean;
}

const formatEuro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const germanDate = (iso: string) => iso.split('-').reverse().join('.');

/**
 * Stellt Eintrag und Rechnung Feld für Feld gegenüber. Felder, die die
 * Kategorie nicht führt, fehlen; die Katalogverknüpfung erscheint nur, wenn
 * der Eintrag noch keine hat und die Karte im Katalog gefunden wurde.
 */
export const compareFields = (
  category: Pick<Category, 'attributes'> | undefined,
  row: Pick<ImportRow, 'line' | 'date' | 'hit' | 'existing'>
): FieldDiff[] => {
  const item = row.existing;
  if (!item) return [];
  const attrs = new Map((category?.attributes ?? []).map((a) => [a.id, a]));
  const v = item.values ?? {};
  const { line } = row;
  const diffs: FieldDiff[] = [];
  const text = (key: FieldKey, label: string, incoming: string | undefined) => {
    if (!incoming || (key !== 'name' && !attrs.has(key))) return;
    const current = String(v[key] ?? '').trim();
    diffs.push({
      key,
      label,
      current: current || '–',
      incoming,
      value: incoming,
      equal: normalizeName(current) === normalizeName(incoming),
      empty: current === '',
    });
  };

  text('name', 'Name', line.kind === 'sealed' ? line.name : row.hit?.name ?? line.name);
  const price = Number(v.purchasePrice) || 0;
  diffs.push({
    key: 'purchasePrice',
    label: 'Kaufpreis',
    current: price ? formatEuro(price) : '–',
    incoming: formatEuro(line.unitPrice),
    value: line.unitPrice,
    equal: Math.round(price * 100) === Math.round(line.unitPrice * 100),
    empty: price === 0,
  });
  if (row.date && attrs.has('addedDate')) {
    const current = typeof v.addedDate === 'string' ? v.addedDate.slice(0, 10) : '';
    diffs.push({
      key: 'addedDate',
      label: 'Gekauft am',
      current: current ? germanDate(current) : '–',
      incoming: germanDate(row.date),
      value: row.date,
      equal: current === row.date,
      empty: current === '',
    });
  }
  const qty = Number(v.quantity) || 0;
  diffs.push({
    key: 'quantity',
    label: 'Anzahl',
    current: String(qty),
    incoming: String(line.quantity),
    value: line.quantity,
    equal: qty === line.quantity,
    empty: qty === 0,
  });
  text('language', 'Sprache', option(languageWord(line.language), attrs.get('language')?.options) || undefined);
  text('condition', 'Zustand', option(conditionWord(line.condition), attrs.get('condition')?.options) || undefined);
  // Fassung und Edition: nur zeigen, wenn Rechnung oder Eintrag etwas Besonderes haben.
  const edition = itemEdition(item, category);
  const reverse = lineIsReverse(line);
  if (reverse || edition.reverse) {
    diffs.push({
      key: 'variant',
      label: 'Fassung',
      current: edition.reverse ? 'Reverse Holo' : 'Normal',
      incoming: reverse ? 'Reverse Holo' : 'Normal',
      value: reverse ? 'reverse' : 'normal',
      equal: edition.reverse === reverse,
      empty: false,
      // Umstellen lässt sich nur die Fassung einer verknüpften Katalogkarte.
      pickable: Boolean(item.catalog),
    });
  }
  const firstEd = Boolean(line.flags?.firstEdition);
  const edAttr = firstEditionAttr(category);
  if (firstEd || edition.firstEdition) {
    diffs.push({
      key: 'firstEdition',
      label: '1. Edition',
      current: edition.firstEdition ? 'ja' : 'nein',
      incoming: firstEd ? 'ja' : 'nein',
      value: firstEd,
      equal: edition.firstEdition === firstEd,
      empty: false,
      pickable: Boolean(edAttr),
    });
  }
  const rarity = rarityInfo(line.rarity);
  const rAttr = rarityAttr(category);
  if (rarity && rAttr) {
    const current = String(v[rAttr.id] ?? '').trim();
    const incoming = option(rarity.label, rAttr.options);
    diffs.push({
      key: 'rarity',
      label: 'Seltenheit',
      current: current || '–',
      incoming,
      value: incoming,
      equal: normalizeName(current) === normalizeName(incoming),
      empty: current === '',
    });
  }
  if (row.hit && !item.catalog) {
    diffs.push({
      key: 'catalog',
      label: 'Katalogkarte',
      current: 'nicht verknüpft',
      incoming: `${row.hit.setName} #${row.hit.localId}${row.hit.status === 'review' ? ' (unsicher)' : ''}`,
      value: { cardId: row.hit.cardId, setId: row.hit.setId, variant: 'normal', ...(row.hit.lang !== 'de' ? { lang: row.hit.lang } : {}) },
      equal: false,
      empty: true,
    });
  }
  return diffs;
};

/**
 * Vorauswahl: leere Felder füllen und sicher gefundene Katalogkarten
 * verknüpfen. Was schon eingetragen ist, ändert nur der Nutzer selbst.
 */
export const defaultPicks = (fields: FieldDiff[], hit: CatalogHit | null): FieldKey[] => {
  // Steht schon ein anderer Kaufpreis drin, stammt der Eintrag vermutlich aus
  // einem anderen Kauf – dann nichts vorwählen.
  const price = fields.find((f) => f.key === 'purchasePrice');
  if (price && !price.equal && !price.empty) return [];
  return fields
    .filter((f) => !f.equal && f.empty && f.pickable !== false && (f.key !== 'catalog' || hit?.status === 'sure'))
    .map((f) => f.key);
};

// --- Vorschlag je Zeile ----------------------------------------------------

export type ImportAction = 'create' | 'update' | 'addQuantity' | 'skip';

export const ACTION_LABEL: Record<ImportAction, string> = {
  create: 'Neu anlegen',
  update: 'Felder anpassen',
  addQuantity: 'Anzahl erhöhen',
  skip: 'Überspringen',
};

export interface ImportRow {
  key: string;
  orderId: string;
  date: string | null;
  line: CardmarketOrderLine;
  categoryId: string | null;
  hit: CatalogHit | null;
  existing: CollectionItem | null;
  action: ImportAction;
  /** Kurze Begründung des Vorschlags für die Vorschau. */
  note: string;
  /** Vergleich mit dem vorhandenen Eintrag (leer ohne Eintrag). */
  fields: FieldDiff[];
  /** Felder, die beim Anpassen übernommen werden. */
  picks: FieldKey[];
}

/** Welche Aktionen für eine Zeile in Frage kommen. */
export const allowedActions = (row: Pick<ImportRow, 'existing' | 'categoryId'>): ImportAction[] =>
  !row.categoryId
    ? ['skip']
    : row.existing
      ? ['update', 'addQuantity', 'create', 'skip']
      : ['create', 'skip'];

export const suggestAction = (
  line: CardmarketOrderLine,
  orderId: string,
  existing: CollectionItem | null,
  hit: CatalogHit | null,
  categoryId: string | null,
  picks: FieldKey[] = []
): { action: ImportAction; note: string } => {
  if (!categoryId) return { action: 'skip', note: 'Keine passende Kategorie in der Sammlung' };
  if (!existing) {
    if (line.kind === 'sealed') return { action: 'create', note: 'Neu in „Sealed Produkte“' };
    if (!hit) return { action: 'create', note: 'Nicht im Katalog gefunden – wird ohne Katalogkarte angelegt' };
    if (hit.status === 'review') return { action: 'create', note: 'Katalogkarte unsicher – bitte prüfen' };
    return { action: 'create', note: 'Noch nicht in der Sammlung' };
  }
  if (existing.purchaseOrders?.includes(orderId)) {
    return { action: 'skip', note: 'Aus dieser Bestellung schon übernommen' };
  }
  const current = Number(existing.values?.purchasePrice) || 0;
  const firstEd = isFirstEditionLink(existing) ? ' (Eintrag ist 1. Edition – bitte prüfen)' : '';
  const priceNote =
    current === 0
      ? 'noch ohne Kaufpreis'
      : Math.round(current * 100) === Math.round(line.unitPrice * 100)
        ? 'Kaufpreis stimmt schon'
        : `Kaufpreis ${formatEuro(current)}`;
  return {
    // Nur leere Felder werden von selbst gefüllt; sonst entscheidet der Nutzer.
    action: picks.length > 0 ? 'update' : 'skip',
    note: `In der Sammlung, ${priceNote}${firstEd}`,
  };
};

/** Baut die Vorschau-Zeilen für alle Bestellungen. */
export async function planImport(
  orders: CardmarketOrder[],
  items: CollectionItem[],
  categories: Category[],
  lookup: CatalogLookup,
  onProgress?: (done: number, total: number) => void
): Promise<ImportRow[]> {
  const total = orders.reduce((s, o) => s + o.lines.length, 0);
  const rows: ImportRow[] = [];
  for (const order of orders) {
    for (const [index, line] of order.lines.entries()) {
      const hit = await resolveCatalogCard(line, lookup);
      const category = targetCategory(categories, line);
      const existing = category ? findExisting(items, categories, line, hit) : null;
      const base = { line, date: order.date, hit, existing };
      const fields = compareFields(categories.find((c) => c.id === existing?.categoryId), base);
      const picks = existing?.purchaseOrders?.includes(order.orderId) ? [] : defaultPicks(fields, hit);
      const { action, note } = suggestAction(line, order.orderId, existing, hit, category?.id ?? null, picks);
      rows.push({
        key: `${order.orderId}:${index}`,
        orderId: order.orderId,
        date: order.date,
        line,
        categoryId: category?.id ?? null,
        hit,
        existing,
        action,
        note,
        fields,
        picks,
      });
      onProgress?.(rows.length, total);
    }
  }
  return rows;
}

// --- Übernehmen ------------------------------------------------------------

/** Daten für einen neuen Eintrag, vorab (asynchron) zusammengestellt. */
export interface NewItemDraft {
  values: Record<string, unknown>;
  links?: Record<string, string>;
  images?: Record<string, string>;
  catalog?: CatalogRef;
}

/**
 * Felder aus der Bestellung, die in jeden neuen Eintrag gehören. `base` sind
 * die Werte aus der Katalogkarte (oder leer), die Bestellung hat Vorrang.
 */
export const orderValues = (
  category: Pick<Category, 'attributes'>,
  row: Pick<ImportRow, 'line' | 'date' | 'hit'>,
  base: Record<string, unknown> = {}
): Record<string, unknown> => {
  const attrs = new Map((category.attributes ?? []).map((a) => [a.id, a]));
  const values: Record<string, unknown> = { ...base };
  for (const attr of category.attributes ?? []) {
    if (attr.id in values || attr.isCalculated || attr.type === 'formula' || attr.type === 'image' || attr.type === 'link')
      continue;
    values[attr.id] = attr.type === 'number' ? 0 : attr.type === 'boolean' ? false : attr.type === 'date' ? null : '';
  }
  const { line } = row;
  if (!base.name) values.name = row.hit ? row.hit.name : line.name;
  values.quantity = line.quantity;
  values.purchasePrice = line.unitPrice;
  if (!('currentValue' in base) || !base.currentValue) values.currentValue = line.unitPrice;
  if (row.date) values.addedDate = row.date;
  if (attrs.has('language') && line.language) values.language = option(languageWord(line.language), attrs.get('language')?.options);
  if (attrs.has('condition') && line.condition)
    values.condition = option(conditionWord(line.condition), attrs.get('condition')?.options);
  if (attrs.has('category') && line.kind === 'sealed' && !values.category) {
    const type = sealedType(line.section, line.name);
    const options = attrs.get('category')?.options;
    // Nur eine vorhandene Auswahl übernehmen, sonst bleibt das Feld leer.
    if (type) values.category = options?.length ? options.find((o) => o.toLowerCase() === type.toLowerCase()) ?? '' : type;
  }
  const edAttr = firstEditionAttr(category);
  if (edAttr && line.flags?.firstEdition) values[edAttr.id] = true;
  const rAttr = rarityAttr(category);
  const rarity = rarityInfo(line.rarity);
  if (rAttr && rarity && !values[rAttr.id]) values[rAttr.id] = option(rarity.label, rAttr.options);
  if (attrs.has('expansion') && !values.expansion) values.expansion = row.hit?.setName ?? line.setCode ?? '';
  return values;
};

export interface ImportResult {
  items: CollectionItem[];
  created: number;
  updated: number;
}

const withOrder = (item: CollectionItem, orderId: string): string[] =>
  item.purchaseOrders?.includes(orderId) ? item.purchaseOrders : [...(item.purchaseOrders ?? []), orderId];

/**
 * Wendet die bestätigten Zeilen auf die Sammlung an (rein, ohne Seiteneffekte).
 * Neue Einträge brauchen einen vorbereiteten Entwurf in `drafts`.
 */
export const applyImport = (
  items: CollectionItem[],
  rows: ImportRow[],
  drafts: Map<string, NewItemDraft>,
  now = new Date(),
  categories: Array<Pick<Category, 'id' | 'attributes'>> = []
): ImportResult => {
  const byId = new Map(items.map((i) => [i.id, i]));
  const added: CollectionItem[] = [];
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    if (row.action === 'skip') continue;
    if (row.action === 'create') {
      const draft = drafts.get(row.key);
      if (!draft || !row.categoryId) continue;
      const item: CollectionItem = {
        id: `item_${uuidv4()}`,
        categoryId: row.categoryId,
        values: draft.values,
        ...(draft.links && Object.keys(draft.links).length > 0 ? { links: draft.links } : {}),
        ...(draft.images && Object.keys(draft.images).length > 0 ? { images: draft.images } : {}),
        ...(draft.catalog ? { catalog: draft.catalog } : {}),
        purchaseOrders: [row.orderId],
        createdAt: now,
        updatedAt: now,
      };
      const trail = recordValue({ values: {}, createdAt: now }, draft.values.currentValue);
      if (trail) item.valueTrail = trail;
      added.push(item);
      created += 1;
      continue;
    }
    const current = row.existing ? byId.get(row.existing.id) : undefined;
    if (!current) continue;
    const values = { ...current.values };
    let catalog = current.catalog;
    // Gewählte Felder übernehmen; beim Erhöhen der Anzahl gelten Menge und
    // Kaufpreis aus der Rechnung nicht, die werden unten verrechnet.
    for (const key of row.picks) {
      const field = row.fields.find((f) => f.key === key);
      if (!field) continue;
      if (row.action === 'addQuantity' && (key === 'quantity' || key === 'purchasePrice')) continue;
      if (field.pickable === false) continue;
      if (key === 'catalog') catalog = field.value as CatalogRef;
      else if (key === 'variant') catalog = catalog ? { ...catalog, variant: field.value as CatalogRef['variant'] } : catalog;
      else if (key === 'firstEdition') {
        const attr = firstEditionAttr(categories.find((c) => c.id === current.categoryId));
        if (attr) values[attr.id] = field.value;
      } else if (key === 'rarity') {
        const attr = rarityAttr(categories.find((c) => c.id === current.categoryId));
        if (attr) values[attr.id] = field.value;
      } else values[key] = field.value;
    }
    if (row.action === 'addQuantity') {
      const oldQty = Number(current.values?.quantity) || 0;
      const newQty = oldQty + row.line.quantity;
      const cost = oldQty * (Number(current.values?.purchasePrice) || 0) + row.line.quantity * row.line.unitPrice;
      values.quantity = newQty;
      values.purchasePrice = Math.round((cost / newQty) * 100) / 100;
    }
    const next: CollectionItem = { ...current, values, purchaseOrders: withOrder(current, row.orderId), updatedAt: now };
    if (catalog) next.catalog = catalog;
    byId.set(current.id, next);
    updated += 1;
  }
  return { items: [...items.map((i) => byId.get(i.id) ?? i), ...added], created, updated };
};
