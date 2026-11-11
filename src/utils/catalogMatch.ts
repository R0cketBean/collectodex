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

import type { CollectionItem } from '../types/models';

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

const namesAgree = (a: string, b: string) => {
  const x = normalizeName(a);
  const y = normalizeName(b);
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
};

const cardNameAgrees = (name: string, card: CatalogCardName) =>
  namesAgree(name, card.name) || (card.altName ? namesAgree(name, card.altName) : false);

const sameNumber = (card: CatalogCardName, number: string | null | undefined) =>
  Boolean(number) && card.localId.replace(/^0+(?=\d)/, '') === number;

/** Ob die Nummer im Cardmarket-Link des Eintrags zur Karte passt. */
export const linkNumberMatches = (item: CollectionItem, card: CatalogCardName) =>
  sameNumber(card, parseCardmarketLink(itemProductLink(item))?.number);

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
  const number = parseCardmarketLink(itemProductLink(item))?.number;
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
    return { status: 'none', candidates: [], reason: 'Set nicht im deutschen Katalog' };
  }

  const byNumber: MatchSuggestion['candidates'] = [];
  const byName: MatchSuggestion['candidates'] = [];
  for (const setId of known) {
    for (const card of cardsBySet[setId] ?? []) {
      if (sameNumber(card, link?.number)) byNumber.push({ setId, card });
      if (cardNameAgrees(name, card)) byName.push({ setId, card });
    }
  }
  const candidates = [...byNumber, ...byName.filter((c) => !byNumber.some((n) => n.card.id === c.card.id))];
  if (candidates.length === 0) {
    return { status: 'none', candidates: [], reason: 'Keine passende Karte im Set gefunden' };
  }

  // Japanische Karten stammen aus anderen Sets; gleiche Namen sind Zufall.
  if (isJapanese(item)) {
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
