// Kartenkatalog über die offene TCGdex-API (https://tcgdex.dev).
//
// TCGdex liefert deutsche Kartennamen, Bilder, Serien (≈ Ären) und
// Cardmarket-Preise in EUR. Die Set-Liste enthält allerdings keine Preise —
// die gibt es nur pro Karte. Deshalb lädt der Katalog die Kartendetails
// eines Sets nachträglich mit begrenzter Parallelität (mapLimit) und hält sie
// im Speicher plus localStorage vor, damit ein erneutes Öffnen schnell ist.

import type { CatalogLang } from '../types/models';

const API_ROOT = 'https://api.tcgdex.net/v2';
const ASSET_ROOT = 'https://assets.tcgdex.net';
type Lang = CatalogLang;

/** Sprachen, zwischen denen der Katalog umschalten kann. */
export const CATALOG_LANGUAGES: Array<{ id: CatalogLang; label: string }> = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'Englisch' },
  { id: 'ja', label: 'Japanisch' },
];

export const isCatalogLang = (value: unknown): value is CatalogLang =>
  CATALOG_LANGUAGES.some((l) => l.id === value);

/**
 * Anzeigename eines Sets. TCGdex übersetzt „Classic Collection“ ins Deutsche
 * („Klassische Kollektion“, „Klassische Sammlung“); gebräuchlich ist auch im
 * Deutschen der englische Begriff.
 */
export const displaySetName = (name: string) => name.replace(/Klassische (Kollektion|Sammlung)/g, 'Classic Collection');

/** Preise werden bei TCGdex etwa einmal täglich aktualisiert. */
const CARD_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CARD_CACHE_PREFIX = 'tcgdex:card:';
const EXCLUDED_SERIES = new Set(['tcgp']);

export interface CardCount {
  total: number;
  official: number;
}

export interface SetBrief {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  cardCount: CardCount;
}

export interface SerieBrief {
  id: string;
  name: string;
  logo?: string;
}

export interface SerieDetail extends SerieBrief {
  releaseDate?: string;
  sets: SetBrief[];
}

export interface CardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

export interface SetDetail extends SetBrief {
  releaseDate?: string;
  serie: { id: string; name: string };
  abbreviation?: { official?: string };
  cards: CardBrief[];
}

export interface CardmarketPricing {
  updated?: string;
  unit?: string;
  idProduct?: number;
  avg?: number | null;
  low?: number | null;
  trend?: number | null;
  avg1?: number | null;
  avg7?: number | null;
  avg30?: number | null;
  'avg-holo'?: number | null;
  'low-holo'?: number | null;
  'trend-holo'?: number | null;
  'avg1-holo'?: number | null;
  'avg7-holo'?: number | null;
  'avg30-holo'?: number | null;
}

export interface CardDetail extends CardBrief {
  rarity?: string;
  types?: string[];
  illustrator?: string;
  category?: string;
  variants?: {
    normal?: boolean;
    reverse?: boolean;
    holo?: boolean;
    firstEdition?: boolean;
  };
  set: { id: string; name: string; cardCount?: CardCount };
  pricing?: { cardmarket?: CardmarketPricing | null } | null;
}

// --- Bild-URLs ------------------------------------------------------------
// TCGdex liefert Basis-URLs ohne Endung; Qualität und Format hängt man an.

export const cardImageUrl = (base: string | undefined, quality: 'low' | 'high' = 'low') =>
  base ? `${base}/${quality}.webp` : undefined;

// TCGdex hat nicht für alle deutschen Karten und Sets Bilder (vor allem
// ältere Sets und Promos). Dann weicht der Katalog auf die englische Fassung
// aus; die Bildkomponente probiert die Quellen der Reihe nach durch.

export interface ImageSource {
  url: string;
  lang: Lang;
}

/** Deutsche Asset-Adresse auf die englische Fassung umschreiben. */
export const englishAssetBase = (base: string) =>
  base.replace(`${ASSET_ROOT}/de/`, `${ASSET_ROOT}/en/`);

/** Adresse des englischen Kartenbilds, wenn TCGdex für die deutsche Karte keins nennt. */
export const englishCardImageBase = (serieId: string | undefined, setId: string, localId: string) =>
  serieId ? `${ASSET_ROOT}/en/${serieId}/${setId}/${localId}` : undefined;

// --- Zweite Bildquelle: pokemontcg.io ---------------------------------------
// TCGdex fehlen für etliche Sets die Bilder ganz (Trainer-Galerien, viele
// Promo-Sets, Celebrations Klassische Kollektion). Die Bilder von
// pokemontcg.io (nur englisch) schließen den größten Teil dieser Lücken. Die
// Set-Kennungen weichen leicht ab: „sv03.5“ heißt dort „sv3pt5“, „sm7.5“
// heißt „sm75“.

const PTCG_IMAGE_ROOT = 'https://images.pokemontcg.io';
const PTCG_SET_OVERRIDES: Record<string, string> = { cel25cc: 'cel25c', hgssp: 'hsp' };

// Die Klassische Kollektion trägt dort die Nummern der Originalkarten.
const PTCG_CEL25C_NUMBERS: Record<string, string> = {
  CC001: '2_A', CC002: '4_A', CC003: '15_A', CC004: '73_A', CC005: '8_A',
  CC006: '15_B', CC007: '15_C', CC008: '24_A', CC009: '20_A', CC010: '66_A',
  CC011: '9_A', CC012: '86_A', CC013: '88_A', CC014: '93_A', CC015: '17_A',
  CC016: '15_D', CC017: '109_A', CC018: '145_A', CC019: '107_A', CC020: '113_A',
  CC021: '114_A', CC022: '54_A', CC023: '97_A', CC024: '76_A', CC025: '60_A',
};

/** Set-Kennung bei pokemontcg.io zur TCGdex-Kennung. */
export const pokemonTcgIoSetId = (setId: string): string => {
  if (PTCG_SET_OVERRIDES[setId]) return PTCG_SET_OVERRIDES[setId];
  const half = /^(sv|swsh12|me)/.test(setId) ? setId.replace('.5', 'pt5') : setId.replace('.5', '5');
  return half.replace(/^(sv|me|swsh|sm|xy|bw|dp|pl|hgss|ex|neo|base|ecard)0+(\d)/, '$1$2');
};

/** Bildadresse bei pokemontcg.io. Ob es das Bild gibt, zeigt erst das Laden. */
export const pokemonTcgIoImage = (setId: string, localId: string, quality: 'low' | 'high' = 'low'): string => {
  const set = pokemonTcgIoSetId(setId);
  const number =
    set === 'cel25c' ? (PTCG_CEL25C_NUMBERS[localId] ?? localId) : /^\d+$/.test(localId) ? String(Number(localId)) : localId;
  return `${PTCG_IMAGE_ROOT}/${set}/${number}${quality === 'high' ? '_hires' : ''}.png`;
};

/**
 * Kartenbild-Quellen in der Reihenfolge, in der sie versucht werden: deutsch
 * (TCGdex), englisch (TCGdex), englisch (pokemontcg.io, wenn `card` angegeben).
 */
export const cardImageSources = (
  germanBase: string | undefined,
  englishBase: string | undefined,
  quality: 'low' | 'high' = 'low',
  card?: { setId: string; localId: string }
): ImageSource[] => {
  const sources: ImageSource[] = [];
  if (germanBase) sources.push({ url: `${germanBase}/${quality}.webp`, lang: 'de' });
  const en = englishBase ?? (germanBase ? englishAssetBase(germanBase) : undefined);
  if (en && en !== germanBase) sources.push({ url: `${en}/${quality}.webp`, lang: 'en' });
  if (card) sources.push({ url: pokemonTcgIoImage(card.setId, card.localId, quality), lang: 'en' });
  return sources;
};

/**
 * Set-Logo: in der Katalogsprache, sonst englisch (TCGdex, dann
 * pokemontcg.io), sonst das Set-Symbol. Für japanische Sets gibt es nur, was
 * TCGdex selbst liefert.
 */
export const setLogoSources = (
  set: Pick<SetBrief, 'id' | 'logo' | 'symbol'>,
  serieId: string | undefined,
  lang: Lang = 'de'
): ImageSource[] => {
  const sources: ImageSource[] = [];
  if (set.logo) sources.push({ url: `${set.logo}.webp`, lang });
  if (lang !== 'ja') {
    const en =
      lang === 'en'
        ? undefined
        : set.logo
          ? englishAssetBase(set.logo)
          : serieId
            ? `${ASSET_ROOT}/en/${serieId}/${set.id}/logo`
            : undefined;
    if (en && en !== set.logo) sources.push({ url: `${en}.webp`, lang: 'en' });
    sources.push({ url: `${PTCG_IMAGE_ROOT}/${pokemonTcgIoSetId(set.id)}/logo.png`, lang: 'en' });
  }
  if (set.symbol) sources.push({ url: `${set.symbol}.webp`, lang });
  return sources;
};

/**
 * Kartenbild-Quellen für eine Katalogsprache. Deutsch weicht auf Englisch aus,
 * Englisch auf pokemontcg.io; für Japanisch gibt es nur das Bild von TCGdex.
 */
export const catalogCardImageSources = (
  lang: Lang,
  card: { image?: string; localId: string },
  setId: string,
  quality: 'low' | 'high' = 'low',
  englishBase?: string
): ImageSource[] => {
  if (lang === 'ja') return card.image ? [{ url: `${card.image}/${quality}.webp`, lang }] : [];
  if (lang === 'en') {
    return [
      ...(card.image ? [{ url: `${card.image}/${quality}.webp`, lang }] : []),
      { url: pokemonTcgIoImage(setId, card.localId, quality), lang },
    ];
  }
  return cardImageSources(card.image, englishBase, quality, { setId, localId: card.localId });
};

// --- Preise ---------------------------------------------------------------

export interface PriceSummary {
  /** Cardmarket-Trendpreis der normalen Fassung (bzw. der einzigen Fassung). */
  trend: number | null;
  /** Günstigstes Cardmarket-Angebot (alle Sprachen und Zustände). */
  low: number | null;
  avg30: number | null;
  /** Reverse-Holo-Trend, nur wenn die Karte eine Reverse-Fassung hat. */
  reverseTrend: number | null;
  reverseLow: number | null;
  updated: string | null;
  idProduct: number | null;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

/**
 * Fasst die Cardmarket-Preise einer Karte zusammen.
 *
 * Die "-holo"-Felder von Cardmarket meinen bei Karten mit normaler UND
 * Reverse-Fassung den Reverse-Holo-Preis. Bei Karten ohne Reverse (z. B.
 * Holo-Rares oder Vintage) sind sie nicht eindeutig zuzuordnen und werden
 * deshalb nicht als Reverse-Preis ausgewiesen.
 */
export const summarizePricing = (card: Pick<CardDetail, 'pricing' | 'variants'>): PriceSummary => {
  const cm = card.pricing?.cardmarket ?? null;
  const hasReverse = Boolean(card.variants?.reverse);
  return {
    trend: num(cm?.trend) ?? num(cm?.avg),
    low: num(cm?.low),
    avg30: num(cm?.avg30),
    reverseTrend: hasReverse ? num(cm?.['trend-holo']) ?? num(cm?.['avg-holo']) : null,
    reverseLow: hasReverse ? num(cm?.['low-holo']) : null,
    updated: cm?.updated ?? null,
    idProduct: typeof cm?.idProduct === 'number' ? cm.idProduct : null,
  };
};

/** Summe der Trendpreise aller geladenen Karten (Untergrenze des Setwerts). */
export const sumSetValue = (cards: Array<Pick<CardDetail, 'pricing' | 'variants'>>) => {
  let total = 0;
  let priced = 0;
  for (const card of cards) {
    const { trend } = summarizePricing(card);
    if (trend !== null) {
      total += trend;
      priced += 1;
    }
  }
  return { total: Math.round(total * 100) / 100, priced };
};

// Betragsformat liegt zentral in utils/format; hier für bestehende Importe weitergereicht.
export { formatEur } from '../utils/format';

/** Cardmarket-Suche nach Kartenname (idProduct-Links sind nicht stabil dokumentiert). */
export const cardmarketSearchUrl = (name: string) =>
  `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(name)}`;

/**
 * Cardmarket-Filter, mit denen neue Einträge aus dem Katalog verlinkt werden:
 * Verkäufer aus Deutschland, Sprache Deutsch, mindestens Near Mint.
 */
export const DEFAULT_CARDMARKET_FILTER = 'sellerCountry=7&language=3&minCondition=2';

/**
 * Link zum Cardmarket-Produkt über die Produktnummer aus TCGdex, mit Filter.
 * Ohne Produktnummer bleibt nur die Suche nach dem Kartennamen.
 */
export const cardmarketProductUrl = (
  idProduct: number | null | undefined,
  name: string,
  filter = DEFAULT_CARDMARKET_FILTER
) =>
  typeof idProduct === 'number'
    ? `https://www.cardmarket.com/de/Pokemon/Products?idProduct=${idProduct}${filter ? `&${filter}` : ''}`
    : cardmarketSearchUrl(name);

// --- Hilfen ---------------------------------------------------------------

/** Normalisiert Text für die Suche: Kleinschreibung, ohne Akzente/Bindestriche. */
export const normalizeSearch = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s\-_.']+/g, '');

/**
 * Führt `fn` für alle Einträge mit höchstens `limit` gleichzeitigen Aufrufen
 * aus. Fehler einzelner Aufrufe brechen den Rest nicht ab (Ergebnis `null`).
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal
): Promise<Array<R | null>> {
  const results: Array<R | null> = new Array(items.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      if (signal?.aborted) return;
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch {
        results[i] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

// --- Netzwerk -------------------------------------------------------------

const memory = new Map<string, Promise<unknown>>();

async function getJson<T>(path: string, signal?: AbortSignal, lang: Lang = 'de'): Promise<T> {
  const res = await fetch(`${API_ROOT}/${lang}${path}`, { signal });
  if (!res.ok) throw new Error(`TCGdex ${res.status} für ${path}`);
  return (await res.json()) as T;
}

/** Wie getJson, aber pro Pfad nur einmal pro App-Sitzung geladen. */
function cachedJson<T>(path: string, lang: Lang = 'de'): Promise<T> {
  const key = `${lang}:${path}`;
  let p = memory.get(key) as Promise<T> | undefined;
  if (!p) {
    p = getJson<T>(path, undefined, lang);
    memory.set(key, p);
    p.catch(() => memory.delete(key));
  }
  return p;
}

/** Alle Serien mit ihren Sets, neueste Serie und neuestes Set zuerst. */
export async function fetchCatalog(lang: Lang = 'de'): Promise<SerieDetail[]> {
  // "tcgp" = Pokémon TCG Pocket: rein digitale Karten, gehören nicht in den Katalog.
  const series = (await cachedJson<SerieBrief[]>('/series', lang)).filter(
    (s) => !EXCLUDED_SERIES.has(s.id.toLowerCase())
  );
  const details = await mapLimit(series, 6, (s) =>
    cachedJson<SerieDetail>(`/series/${encodeURIComponent(s.id)}`, lang)
  );
  return details
    .filter((d): d is SerieDetail => d !== null && Array.isArray(d.sets) && d.sets.length > 0)
    .map((d) => ({ ...d, sets: [...d.sets].reverse().map((s) => ({ ...s, name: displaySetName(s.name) })) }))
    .sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
}

/**
 * Alle deutschen Sets mit deutschem und englischem Namen – Grundlage, um
 * Sammlungseinträge über Freitext oder Cardmarket-Link einem Set zuzuordnen.
 * Die IDs sind in beiden Sprachen gleich.
 */
export async function fetchSetNames(): Promise<Array<{ id: string; names: string[] }>> {
  const [de, en] = await Promise.all([
    cachedJson<SetBrief[]>('/sets'),
    cachedJson<SetBrief[]>('/sets', 'en').catch(() => [] as SetBrief[]),
  ]);
  const english = new Map(en.map((s) => [s.id, s.name]));
  return de.map((s) => ({
    id: s.id,
    names: [displaySetName(s.name), english.get(s.id)].filter((n): n is string => Boolean(n)),
  }));
}

/** Alle Sets einer Sprache mit Kennung und Namen (für die Auswahl von Hand). */
export async function fetchSetList(lang: Lang): Promise<Array<{ id: string; names: string[] }>> {
  if (lang === 'de') return fetchSetNames();
  const sets = await cachedJson<SetBrief[]>('/sets', lang);
  return sets.map((s) => ({ id: s.id, names: [s.name] }));
}

/**
 * Ein Set mit seiner Kartenliste. Für einzelne deutsche Sets führt TCGdex
 * keine Karten (z. B. „Celebrations Klassische Kollektion“); dann kommt die
 * Liste aus der englischen Fassung – IDs und Nummern sind dieselben, nur die
 * Kartennamen sind englisch.
 */
export async function fetchSet(setId: string, lang: Lang = 'de'): Promise<SetDetail> {
  const path = `/sets/${encodeURIComponent(setId)}`;
  const raw = await cachedJson<SetDetail>(path, lang);
  const set = { ...raw, name: displaySetName(raw.name) };
  if (lang !== 'de' || (Array.isArray(set.cards) && set.cards.length > 0)) return { ...set, cards: set.cards ?? [] };
  const english = await cachedJson<SetDetail>(path, 'en').catch(() => null);
  return english?.cards?.length ? { ...set, cards: english.cards } : { ...set, cards: set.cards ?? [] };
}

/**
 * Englische Kartenbilder eines Sets, nach Kartennummer. Dient als Ersatz für
 * Karten ohne deutsches Bild. Gibt es das Set auf Englisch nicht (oder ist die
 * API nicht erreichbar), bleibt die Zuordnung leer.
 */
export async function fetchEnglishCardImages(setId: string): Promise<Record<string, string>> {
  try {
    const set = await cachedJson<SetDetail>(`/sets/${encodeURIComponent(setId)}`, 'en');
    const images: Record<string, string> = {};
    for (const card of set.cards ?? []) {
      if (card.image) images[card.localId] = card.image;
    }
    return images;
  } catch {
    return {};
  }
}

// Deutsche Karten behalten den bisherigen Schlüssel; andere Sprachen bekommen ein Präfix.
const cardCacheKey = (id: string, lang: Lang) => CARD_CACHE_PREFIX + (lang === 'de' ? '' : `${lang}:`) + id;

const readCardCache = (id: string, lang: Lang): CardDetail | null => {
  try {
    const raw = localStorage.getItem(cardCacheKey(id, lang));
    if (!raw) return null;
    const { at, card } = JSON.parse(raw) as { at: number; card: CardDetail };
    return Date.now() - at < CARD_CACHE_TTL_MS ? card : null;
  } catch {
    return null;
  }
};

const writeCardCache = (card: CardDetail, lang: Lang) => {
  try {
    // Nur die Felder speichern, die der Katalog anzeigt (Attacken etc. weglassen).
    const slim: CardDetail = {
      id: card.id,
      localId: card.localId,
      name: card.name,
      image: card.image,
      rarity: card.rarity,
      types: card.types,
      illustrator: card.illustrator,
      category: card.category,
      variants: card.variants,
      set: card.set,
      pricing: card.pricing?.cardmarket ? { cardmarket: card.pricing.cardmarket } : null,
    };
    localStorage.setItem(cardCacheKey(card.id, lang), JSON.stringify({ at: Date.now(), card: slim }));
  } catch {
    // Speicher voll oder nicht verfügbar: dann eben ohne Cache.
  }
};

export async function fetchCard(cardId: string, signal?: AbortSignal, lang: Lang = 'de'): Promise<CardDetail> {
  const cached = readCardCache(cardId, lang);
  if (cached) return cached;
  const path = `/cards/${encodeURIComponent(cardId)}`;
  // Karten, die es bei TCGdex nur englisch gibt (siehe fetchSet), von dort holen.
  const card = await getJson<CardDetail>(path, signal, lang).catch((error) => {
    if (signal?.aborted || lang !== 'de') throw error;
    return getJson<CardDetail>(path, signal, 'en');
  });
  writeCardCache(card, lang);
  return card;
}

/**
 * Lädt die Details (inkl. Preise) aller Karten eines Sets. `onCard` wird für
 * jede fertig geladene Karte aufgerufen, damit die Liste nach und nach Preise
 * zeigt.
 */
export function loadSetCards(
  cards: CardBrief[],
  onCard: (card: CardDetail) => void,
  signal?: AbortSignal,
  lang: Lang = 'de'
) {
  return mapLimit(
    cards,
    6,
    async (c) => {
      const card = await fetchCard(c.id, signal, lang);
      if (!signal?.aborted) onCard(card);
      return card;
    },
    signal
  );
}
