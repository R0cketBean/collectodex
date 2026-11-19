// Kartenscanner (#168): sucht zu den gelesenen Angaben passende Karten im
// deutschen TCGdex-Katalog.
//
// Reihenfolge der Hinweise:
// 1. Set-Code („SVI“) → genau ein Set.
// 2. Gedruckte Gesamtzahl („/198“) → alle Sets mit dieser offiziellen Kartenzahl.
// 3. Nichts davon lesbar → Suche über den Kartennamen.
// In den gefundenen Sets zählt die Karte mit der gelesenen Nummer; der Name
// entscheidet bei mehreren Sets. Bewertet wird in utils/cardScan.ts.
//
// Bildvergleich (#170): Reicht der Text nicht für einen sicheren Treffer,
// entscheidet das Artwork mit – unter den gefundenen Kandidaten, unter allen
// Karten der Sets mit der gelesenen Gesamtzahl (Nummer unlesbar) oder unter
// allen Karten mit dem gelesenen Namen (Set unbekannt, z. B. WotC-Ära).

import {
  fetchExcludedSetIds,
  fetchSet,
  fetchSetsByCode,
  fetchSetSummaries,
  mapLimit,
  searchCardsByName,
  type CardBrief,
  type SetBrief,
  type SetDetail,
} from './tcgdex';
import type { CatalogLang } from '../types/models';
import {
  isConfident,
  localIdMatches,
  nameSimilarity,
  rankCandidates,
  type RankedCandidate,
  type ScanCandidate,
  type ScanInfo,
} from '../utils/cardScan';
import { IMAGE_MATCH_MAX, imageMatches } from '../utils/imageFingerprint';
import { JP_VINTAGE_SETS } from './jpVintageArtwork';
import type { VisualCard, VisualMatcher } from './imageMatch';

export interface CatalogSource {
  setsByCode: (code: string) => Promise<SetBrief[]>;
  allSets: () => Promise<SetBrief[]>;
  set: (setId: string) => Promise<SetDetail>;
  cardsByName: (name: string) => Promise<CardBrief[]>;
}

/** Gehört die Karte zu einem dieser Sets? („A1-094“ zu „A1“, nicht zu „A1a“.) */
const inSets = (card: CardBrief, setIds: Set<string>) =>
  [...setIds].some((id) => card.id.startsWith(`${id}-`));

/**
 * Katalog von TCGdex in der Sprache der Karte (#169: Deutsch, Englisch,
 * Japanisch) – ohne Pokémon TCG Pocket: Dessen digitale Karten liefert TCGdex
 * bei der Set- und Namenssuche mit („Unschlagbare Gene 094/226“), gedruckt
 * gibt es sie nicht.
 */
export const tcgdexSource = (lang: CatalogLang = 'de'): CatalogSource => {
  let excluded: Promise<Set<string>> | null = null;
  const excludedSets = () => (excluded ??= fetchExcludedSetIds(lang).catch(() => new Set<string>()));
  const withoutExcluded = async (sets: SetBrief[]) => {
    const skip = await excludedSets();
    return sets.filter((s) => !skip.has(s.id));
  };
  return {
    setsByCode: async (code) => withoutExcluded(await fetchSetsByCode(code, lang)),
    allSets: async () => withoutExcluded(await fetchSetSummaries(lang)),
    set: (setId) => fetchSet(setId, lang),
    cardsByName: async (name) => {
      const [found, skip, vintage] = await Promise.all([
        searchCardsByName(name, lang).catch(() => [] as CardBrief[]),
        excludedSets(),
        lang === 'ja' ? vintageByName(name) : Promise.resolve([] as CardBrief[]),
      ]);
      const cards = [...new Map([...found, ...vintage].map((c) => [c.id, c])).values()];
      return cards.filter((c) => !inSets(c, skip));
    },
  };
};

// Unscharfe Namenssuche in den japanischen Vintage-Sets (#180): Die alte
// Schrift liest die Texterkennung oft nur halb richtig („リサードソ“), und
// TCGdex sucht nur nach exakten Teilstücken. Die Sets sind wenige und werden
// zwischengespeichert.
const VINTAGE_NAME_MIN = 0.6;
const vintageByName = async (name: string): Promise<CardBrief[]> => {
  const sets = await mapLimit(JP_VINTAGE_SETS, 4, (id) => fetchSet(id, 'ja'));
  return sets
    .filter((s): s is SetDetail => s !== null)
    .flatMap((s) => s.cards)
    .filter((c) => nameSimilarity(name, c.name) >= VINTAGE_NAME_MIN);
};

// Mehr Sets lädt der Scanner pro Foto nicht – jedes ist eine Abfrage.
const MAX_SETS = 8;
// Bildvergleich: so viele Sets werden ganz durchsucht (Nummer unlesbar) …
const VISUAL_SETS = 3;
// … und so viele gleichnamige Karten verglichen (Set unbekannt). Beliebte
// Pokémon haben über hundert Karten; die richtige steht in der Namenssuche
// irgendwo. Jedes Bild wird nur einmal geladen und dann zwischengespeichert.
const VISUAL_NAMED = 160;
// Bilder gleichzeitig laden – schonend für die Bildquellen.
const VISUAL_PARALLEL = 6;

const toCandidate = (set: SetDetail, card: CardBrief): ScanCandidate => ({
  cardId: card.id,
  setId: set.id,
  setName: set.name,
  localId: card.localId,
  name: card.name,
  image: card.image,
  official: set.cardCount?.official,
  setCode: set.abbreviation?.official,
  serieId: set.serie?.id,
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

/** Bildabstände, je Karte höchstens einmal berechnet. */
const distanceMemo = (visual: VisualMatcher) => {
  const memo = new Map<string, number | null>();
  const measure = async (cards: VisualCard[]) => {
    const todo = cards.filter((c) => !memo.has(c.cardId));
    const unique = [...new Map(todo.map((c) => [c.cardId, c])).values()];
    await mapLimit(unique, VISUAL_PARALLEL, async (card) => {
      memo.set(card.cardId, await visual.distance(card).catch(() => null));
    });
    return memo;
  };
  return { memo, measure };
};

/**
 * Sucht und bewertet passende Katalogkarten. Mit `visual` (Bild der
 * entzerrten Karte) entscheidet das Artwork mit, wenn der Text nicht reicht.
 */
export async function findScanCandidates(
  read: ScanInfo,
  source: CatalogSource = tcgdexSource('de'),
  visual?: VisualMatcher
): Promise<ScanSearchResult> {
  let info = read;
  const images = visual ? distanceMemo(visual) : null;
  // Nur Bildtreffer behalten – wenn alle Karten eines Sets verglichen wurden.
  let onlyPictured = false;
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
    const sets = (await mapLimit([...setIds].slice(0, MAX_SETS), 4, (id) => source.set(id))).filter(
      (s): s is SetDetail => s !== null
    );
    candidates = candidatesInSets(sets, info);
    // Nummer und Name unlesbar, aber die Gesamtzahl grenzt auf wenige Sets ein:
    // alle Karten dieser Sets per Bild vergleichen.
    if (candidates.length === 0 && images && sets.length <= VISUAL_SETS) {
      candidates = sets.flatMap((set) => set.cards.map((card) => toCandidate(set, card)));
      onlyPictured = true;
    }
  }

  // Ohne Treffer über Code und Gesamtzahl: über den Namen suchen.
  if (candidates.length === 0 && info.name) {
    const cards = await source.cardsByName(info.name).catch(() => [] as CardBrief[]);
    // Passt keine Nummer (z. B. Promo, die im Katalog fehlt), wenigstens die
    // Karten mit diesem Namen zeigen – als unsichere Vorschläge.
    const byNumber = cards.filter((c) => localIdMatches(c.localId, info.number));
    let relevant = (byNumber.length > 0 ? byNumber : cards).sort(
      (a, b) => nameSimilarity(info.name, b.name) - nameSimilarity(info.name, a.name)
    );
    // Ohne Nummer gibt es oft Dutzende gleichnamige Karten (z. B. „Glurak“):
    // die mit dem passenden Artwork nach vorn holen.
    if (images && byNumber.length === 0 && relevant.length > MAX_SETS) {
      // Nur Karten mit genau diesem Namen, falls es welche gibt („Pikachu“, nicht „Pikachu-V“).
      const top = nameSimilarity(info.name, relevant[0].name);
      const named = relevant.filter((c) => nameSimilarity(info.name, c.name) >= top).slice(0, VISUAL_NAMED);
      const memo = await images.measure(named.map((c) => ({ cardId: c.id, setId: setIdOfCard(c), localId: c.localId, image: c.image })));
      // Passende Bilder zuerst, dann Karten ohne Bild (z. B. japanische
      // Vintage-Karten – nicht ausgeschlossen), zuletzt unpassende Bilder.
      const far = (c: CardBrief) => {
        const d = memo.get(c.id);
        if (d === undefined || d === null) return 1;
        return d <= IMAGE_MATCH_MAX ? d : 2 + d;
      };
      relevant = [...named].sort((a, b) => far(a) - far(b));
    }
    relevant = relevant.slice(0, MAX_SETS);
    const sets = await mapLimit([...new Set(relevant.map(setIdOfCard))], 4, (id) => source.set(id));
    const byId = new Map(sets.filter((s): s is SetDetail => s !== null).map((s) => [s.id, s]));
    candidates = relevant.flatMap((card) => {
      const set = byId.get(setIdOfCard(card));
      return set ? [toCandidate(set, card)] : [];
    });
  }

  if (!images || candidates.length === 0) return { info, candidates: rankCandidates(candidates, info).slice(0, 12) };

  // Bildvergleich, wenn der Text allein nicht sicher ist.
  const byText = rankCandidates(candidates, info);
  if (!onlyPictured && isConfident(byText)) return { info, candidates: byText.slice(0, 12) };
  const pool = onlyPictured ? candidates : byText.slice(0, 16);
  const memo = await images.measure(pool);
  let ranked = rankCandidates(onlyPictured ? candidates : pool, info, memo);
  if (onlyPictured) {
    const pictured = imageMatches(memo);
    ranked = ranked.filter((c) => pictured.has(c.cardId));
  }
  return { info, candidates: ranked.slice(0, 12) };
}
