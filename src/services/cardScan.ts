// Kartenscanner (#168): sucht zu den gelesenen Angaben passende Karten im
// deutschen TCGdex-Katalog.
//
// Reihenfolge der Hinweise:
// 1. Set-Code („SVI“) → genau ein Set.
// 2. Gedruckte Gesamtzahl („/198“) → alle Sets mit dieser offiziellen Kartenzahl.
// 3. Nichts davon lesbar → Suche über den Kartennamen.
// In den gefundenen Sets zählt die Karte mit der gelesenen Nummer; der Name
// entscheidet bei mehreren Sets. Bewertet wird in utils/cardScan.ts.

import {
  fetchSet,
  fetchSetsByCode,
  fetchSetSummaries,
  mapLimit,
  searchCardsByName,
  type CardBrief,
  type SetBrief,
  type SetDetail,
} from './tcgdex';
import { localIdMatches, nameSimilarity, rankCandidates, type RankedCandidate, type ScanCandidate, type ScanInfo } from '../utils/cardScan';

export interface CatalogSource {
  setsByCode: (code: string) => Promise<SetBrief[]>;
  allSets: () => Promise<SetBrief[]>;
  set: (setId: string) => Promise<SetDetail>;
  cardsByName: (name: string) => Promise<CardBrief[]>;
}

const tcgdexSource: CatalogSource = {
  setsByCode: (code) => fetchSetsByCode(code),
  allSets: () => fetchSetSummaries(),
  set: (setId) => fetchSet(setId),
  cardsByName: (name) => searchCardsByName(name),
};

// Mehr Sets lädt der Scanner pro Foto nicht – jedes ist eine Abfrage.
const MAX_SETS = 8;

const toCandidate = (set: SetDetail, card: CardBrief): ScanCandidate => ({
  cardId: card.id,
  setId: set.id,
  setName: set.name,
  localId: card.localId,
  name: card.name,
  image: card.image,
  official: set.cardCount?.official,
  setCode: set.abbreviation?.official,
});

/** Set-Kennung aus einer Karten-ID („sv03.5-006“ → „sv03.5“). */
const setIdOfCard = (card: CardBrief) =>
  card.id.endsWith(`-${card.localId}`) ? card.id.slice(0, -card.localId.length - 1) : card.id.replace(/-[^-]+$/, '');

/** Kandidaten aus den Sets: Karte mit der gelesenen Nummer, sonst namensähnliche Karten. */
const candidatesInSets = (sets: SetDetail[], info: ScanInfo): ScanCandidate[] =>
  sets.flatMap((set) => {
    const byNumber = set.cards.filter((c) => localIdMatches(c.localId, info.number));
    const pool = byNumber.length > 0 ? byNumber : set.cards.filter((c) => nameSimilarity(info.name, c.name) >= 0.75);
    return pool.map((card) => toCandidate(set, card));
  });

export interface ScanSearchResult {
  /** Die verwendeten Angaben – mit korrigiertem Set-Code, falls nötig. */
  info: ScanInfo;
  /** Passende Katalogkarten, der beste Treffer zuerst. */
  candidates: RankedCandidate[];
}

/** Sucht und bewertet passende Katalogkarten. */
export async function findScanCandidates(read: ScanInfo, source: CatalogSource = tcgdexSource): Promise<ScanSearchResult> {
  let info = read;
  const setIds = new Set<string>();

  if (info.setCode) {
    // Das Regulierungszeichen davor („H TWM“) wird manchmal mitgelesen: „HTWM“.
    const codes = info.setCode.length >= 4 ? [info.setCode, info.setCode.slice(1)] : [info.setCode];
    for (const code of codes) {
      const byCode = await source.setsByCode(code).catch(() => [] as SetBrief[]);
      byCode.forEach((s) => setIds.add(s.id));
      if (setIds.size > 0) {
        info = { ...info, setCode: code };
        break;
      }
    }
  }
  if (info.total !== undefined && (setIds.size === 0 || !info.number)) {
    const all = await source.allSets().catch(() => [] as SetBrief[]);
    all.filter((s) => s.cardCount?.official === info.total).forEach((s) => setIds.add(s.id));
  }

  let candidates: ScanCandidate[] = [];
  if (setIds.size > 0) {
    const sets = await mapLimit([...setIds].slice(0, MAX_SETS), 4, (id) => source.set(id));
    candidates = candidatesInSets(sets.filter((s): s is SetDetail => s !== null), info);
  }

  // Ohne Treffer über Code und Gesamtzahl: über den Namen suchen.
  if (candidates.length === 0 && info.name) {
    const cards = await source.cardsByName(info.name).catch(() => [] as CardBrief[]);
    // Passt keine Nummer (z. B. Promo, die im Katalog fehlt), wenigstens die
    // Karten mit diesem Namen zeigen – als unsichere Vorschläge.
    const byNumber = cards.filter((c) => localIdMatches(c.localId, info.number));
    const relevant = (byNumber.length > 0 ? byNumber : cards)
      .sort((a, b) => nameSimilarity(info.name, b.name) - nameSimilarity(info.name, a.name))
      .slice(0, MAX_SETS);
    const sets = await mapLimit([...new Set(relevant.map(setIdOfCard))], 4, (id) => source.set(id));
    const byId = new Map(sets.filter((s): s is SetDetail => s !== null).map((s) => [s.id, s]));
    candidates = relevant.flatMap((card) => {
      const set = byId.get(setIdOfCard(card));
      return set ? [toCandidate(set, card)] : [];
    });
  }

  return { info, candidates: rankCandidates(candidates, info).slice(0, 12) };
}
