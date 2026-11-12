// Ordnet bestehende Sammlungseinträge Karten aus dem Katalog zu (#125).
//
// Die Einträge tragen meist weder Set-ID noch Kartennummer. Das zuverlässigste
// Signal ist der Cardmarket-Link: `…/Singles/<Set>/<Karte>-<Kürzel><Nummer>`
// nennt das (englische) Set und die Nummer. Fehlt der Link oder führt er zu
// nichts, bleibt der Freitext „Erweiterung“ plus der Kartenname.
//
// Ein Vorschlag gilt nur dann als „sicher“, wenn zwei unabhängige Hinweise
// übereinstimmen (Nummer UND Name, oder Set UND eindeutiger Name). Alles
// andere wird dem Nutzer zur Auswahl vorgelegt, nie still übernommen.

import type { Category, CollectionItem } from '../types/models';

/** Vereinheitlicht Text für Vergleiche: klein, ohne Akzente und Sonderzeichen. */
export const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'und')
    .replace(/[^a-z0-9]/g, '');

export interface CatalogSetName {
  id: string;
  /** Deutscher und englischer Setname. */
  names: string[];
}

export interface CatalogCardName {
  id: string;
  localId: string;
  name: string;
  /** Name in einer zweiten Sprache (z. B. deutsch zur englischen Karte), nur für den Vergleich. */
  altName?: string;
  image?: string;
}

export interface CardmarketLinkInfo {
  setSlug: string;
  /** Kartennummer aus dem letzten Abschnitt, ohne führende Nullen; null, wenn keine erkennbar ist. */
  number: string | null;
}

/** Liest Set und Nummer aus einem Cardmarket-Einzelkarten-Link. */
export const parseCardmarketLink = (url: string | undefined): CardmarketLinkInfo | null => {
  if (!url) return null;
  const match = /\/Singles\/([^/?#]+)(?:\/([^/?#]+))?/.exec(url);
  if (!match) return null;
  const last = (match[2] ?? '').split('-').pop() ?? '';
  // „BS4“ → 4, „TG05“ → 5, „sv2a201“ → 201 (Set-Kürzel und Nummer hängen bei
  // japanischen Karten zusammen). Reine Versionsangaben wie „V1“ sind keine Nummer.
  const number = /^V\d+$/.test(last) ? null : /(\d+)[a-z]?$/.exec(last);
  return { setSlug: match[1], number: number ? number[1].replace(/^0+(?=\d)/, '') : null };
};

/** Der Link, der am Eintrag als Produkt-Link gilt (neu unter `product`, älter unter `name`). */
export const itemProductLink = (item: Pick<CollectionItem, 'links'>) =>
  item.links?.product || item.links?.name || undefined;

/** Sets, deren deutscher oder englischer Name dem Text entspricht. */
export const findSetIds = (sets: CatalogSetName[], text: string | undefined): string[] => {
  const wanted = normalizeName(text ?? '');
  if (!wanted) return [];
  return sets.filter((s) => s.names.some((n) => normalizeName(n) === wanted)).map((s) => s.id);
};

/** Mögliche Sets eines Eintrags: erst über den Link, dann über „Erweiterung“. */
export const candidateSetIds = (sets: CatalogSetName[], item: CollectionItem): string[] => {
  const link = parseCardmarketLink(itemProductLink(item));
  const ids = new Set<string>([
    ...(link ? findSetIds(sets, link.setSlug) : []),
    ...findSetIds(sets, typeof item.values?.expansion === 'string' ? item.values.expansion : undefined),
  ]);
  return [...ids];
};

// Japanische Schrift fällt beim Vereinheitlichen weg; von „リザードンex“ bliebe
// nur „ex“ und passte dann zu jeder ex-Karte. Solche Namen sind nicht vergleichbar.
const JAPANESE_SCRIPT = /[\u3040-\u30ff\u3400-\u9fff]/;

const namesAgree = (a: string, b: string) => {
  if (JAPANESE_SCRIPT.test(a) || JAPANESE_SCRIPT.test(b)) return false;
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (x.length === 0 || y.length === 0) return false;
  // Sehr kurze Namen („d“ bei einzelnen Katalogkarten) stecken in fast jedem anderen.
  return x === y || (Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x)));
};

const cardNameAgrees = (name: string, card: CatalogCardName) =>
  namesAgree(name, card.name) || (card.altName ? namesAgree(name, card.altName) : false);

const sameNumber = (card: CatalogCardName, number: string | null | undefined) =>
  Boolean(number) && card.localId.replace(/^0+(?=\d)/, '') === number;

/**
 * Kartennummer aus dem Link, wenn dessen letzter Abschnitt mit dem Kürzel des
 * Sets beginnt. Cardmarket hängt bei japanischen Karten Set-Kürzel und Nummer
 * zusammen: „sv2a201“ ist Nr. 201 in SV2a, „sm9001“ Nr. 1 in SM9 (und nicht
 * Nr. 9001). Das Kürzel im Link bestätigt zugleich das Set.
 * @param setKey Set-Kennung, auch mit Sprachpräfix („ja:SM9“)
 */
export const linkNumberWithSetCode = (item: Pick<CollectionItem, 'links'>, setKey: string): string | null => {
  const tail = /\/Singles\/[^/?#]+\/([^/?#]+)/.exec(itemProductLink(item) ?? '')?.[1].split('-').pop() ?? '';
  const code = setKey.replace(/^(en|ja):/, '').toLowerCase();
  if (!code || !tail.toLowerCase().startsWith(code)) return null;
  const rest = /^(\d+)[a-z]?$/.exec(tail.slice(code.length).toLowerCase());
  return rest ? rest[1].replace(/^0+(?=\d)/, '') : null;
};

/** Nummer aus dem Link für ein bestimmtes Set: mit Set-Kürzel, sonst die allgemein gelesene. */
const linkNumberIn = (item: CollectionItem, setKey: string | undefined) =>
  (setKey ? linkNumberWithSetCode(item, setKey) : null) ?? parseCardmarketLink(itemProductLink(item))?.number;

/** Ob die Nummer im Cardmarket-Link des Eintrags zur Karte passt (im Set `setKey`, falls angegeben). */
export const linkNumberMatches = (item: CollectionItem, card: CatalogCardName, setKey?: string) =>
  sameNumber(card, linkNumberIn(item, setKey));

const isJapanese = (item: CollectionItem) =>
  typeof item.values?.language === 'string' && /^jap/i.test(item.values.language);

/**
 * Kandidaten für die manuelle Zuordnung: alle Karten des gewählten Sets. Zuerst
 * die Karte, deren Nummer im Cardmarket-Link steht, dann namensgleiche, dann
 * der Rest nach Kartennummer.
 */
export const manualCandidates = (
  item: CollectionItem,
  setId: string,
  cards: CatalogCardName[]
): Array<{ setId: string; card: CatalogCardName }> => {
  const name = typeof item.values?.name === 'string' ? item.values.name : '';
  const byNumber = (a: CatalogCardName, b: CatalogCardName) =>
    a.localId.localeCompare(b.localId, 'de', { numeric: true, sensitivity: 'base' });
  const number = linkNumberIn(item, setId);
  const numbered = cards.filter((c) => sameNumber(c, number));
  const matching = cards.filter((c) => !numbered.includes(c) && cardNameAgrees(name, c)).sort(byNumber);
  const rest = cards.filter((c) => !numbered.includes(c) && !matching.includes(c)).sort(byNumber);
  return [...numbered, ...matching, ...rest].map((card) => ({ setId, card }));
};

export type MatchStatus = 'sure' | 'review' | 'none';

export interface MatchSuggestion {
  status: MatchStatus;
  /** Bester Vorschlag (bei „sure“ der Treffer, bei „review“ die Vorauswahl). */
  best?: { setId: string; card: CatalogCardName };
  /** Weitere Kandidaten zur Auswahl, bester zuerst. */
  candidates: Array<{ setId: string; card: CatalogCardName }>;
  /** Kurze Begründung für die Anzeige. */
  reason: string;
}

/**
 * Schlägt für einen Eintrag eine Katalogkarte vor.
 * @param cardsBySet Karten der in Frage kommenden Sets (setId → Karten)
 */
export const suggestMatch = (
  item: CollectionItem,
  setIds: string[],
  cardsBySet: Record<string, CatalogCardName[] | undefined>
): MatchSuggestion => {
  const name = typeof item.values?.name === 'string' ? item.values.name : '';
  const link = parseCardmarketLink(itemProductLink(item));
  const known = setIds.filter((id) => cardsBySet[id]);
  if (known.length === 0) {
    return { status: 'none', candidates: [], reason: 'Set nicht im Katalog gefunden' };
  }

  const byNumber: MatchSuggestion['candidates'] = [];
  const byName: MatchSuggestion['candidates'] = [];
  // Treffer, bei denen der Link das Set-Kürzel selbst nennt („sv2a201“ im Set SV2a).
  const byCode: MatchSuggestion['candidates'] = [];
  for (const setId of known) {
    const coded = linkNumberWithSetCode(item, setId);
    for (const card of cardsBySet[setId] ?? []) {
      if (sameNumber(card, coded ?? link?.number)) byNumber.push({ setId, card });
      if (sameNumber(card, coded)) byCode.push({ setId, card });
      if (cardNameAgrees(name, card)) byName.push({ setId, card });
    }
  }
  const candidates = [...byNumber, ...byName.filter((c) => !byNumber.some((n) => n.card.id === c.card.id))];
  if (candidates.length === 0) {
    return { status: 'none', candidates: [], reason: 'Keine passende Karte im Set gefunden' };
  }

  // Japanische Karten heißen im Katalog japanisch, der Name taugt nicht zum
  // Vergleich. Sicher ist ein Treffer nur, wenn Set (über Name oder Link
  // gefunden) und Set-Kürzel im Link übereinstimmen und die Nummer eindeutig ist.
  if (isJapanese(item)) {
    if (byCode.length === 1) {
      return { status: 'sure', best: byCode[0], candidates, reason: 'Set-Kürzel und Nummer aus dem Link stimmen überein' };
    }
    return { status: 'review', best: candidates[0], candidates, reason: 'Japanische Karte – bitte prüfen' };
  }
  const numberAndName = byNumber.filter((c) => cardNameAgrees(name, c.card));
  if (numberAndName.length === 1) {
    return { status: 'sure', best: numberAndName[0], candidates, reason: 'Nummer und Name stimmen überein' };
  }
  if (!link?.number && byName.length === 1) {
    return { status: 'sure', best: byName[0], candidates, reason: 'Name ist im Set eindeutig' };
  }
  return {
    status: 'review',
    best: candidates[0],
    candidates,
    reason:
      byNumber.length > 0 && numberAndName.length === 0
        ? 'Nummer passt, Name weicht ab'
        : 'Mehrere Karten kommen in Frage',
  };
};

// --- Welche Einträge überhaupt Karten sind ---------------------------------

/**
 * Ob eine Kategorie von Haus aus Karten enthält: Sie führt das Feld
 * „Erweiterung“ (wie Einzelkarten und gegradete Karten). Sealed-Produkte,
 * Zubehör und Ähnliches gehören zwar zu einem Set, sind aber keine Karte aus
 * dem Katalog.
 */
export const isCardCategory = (category: Pick<Category, 'attributes'>) =>
  (category.attributes ?? []).some((a) => a.id === 'expansion');

/**
 * Kategorien, deren Einträge der Verknüpfungs-Assistent anbietet. Die
 * Vorgabe ergibt sich aus `isCardCategory`; `overrides` (Kategorie → an/aus)
 * hält fest, was der Nutzer davon abweichend gewählt hat.
 */
export const linkCategoryIds = (
  categories: Array<Pick<Category, 'id' | 'attributes'>>,
  overrides: Record<string, boolean> = {}
): Set<string> =>
  new Set(categories.filter((c) => overrides[c.id] ?? isCardCategory(c)).map((c) => c.id));
