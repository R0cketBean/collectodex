// Kartenkatalog über die offene TCGdex-API (https://tcgdex.dev).
//
// TCGdex liefert deutsche Kartennamen, Bilder, Serien (≈ Ären) und
// Cardmarket-Preise in EUR. Die Set-Liste enthält allerdings keine Preise —
// die gibt es nur pro Karte. Deshalb lädt der Katalog die Kartendetails
// eines Sets nachträglich mit begrenzter Parallelität (mapLimit) und hält sie
// im Speicher plus localStorage vor, damit ein erneutes Öffnen schnell ist.

const API_ROOT = 'https://api.tcgdex.net/v2';
const ASSET_ROOT = 'https://assets.tcgdex.net';
type Lang = 'de' | 'en';

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

/** Kartenbild: deutsch, sonst englisch (aus dem englischen Set, siehe fetchEnglishCardImages). */
export const cardImageSources = (
  germanBase: string | undefined,
  englishBase: string | undefined,
  quality: 'low' | 'high' = 'low'
): ImageSource[] => {
  const sources: ImageSource[] = [];
  if (germanBase) sources.push({ url: `${germanBase}/${quality}.webp`, lang: 'de' });
  const en = englishBase ?? (germanBase ? englishAssetBase(germanBase) : undefined);
  if (en && en !== germanBase) sources.push({ url: `${en}/${quality}.webp`, lang: 'en' });
  return sources;
};

/** Set-Logo: deutsch, sonst englisch, sonst das Set-Symbol. */
export const setLogoSources = (
  set: Pick<SetBrief, 'id' | 'logo' | 'symbol'>,
  serieId: string | undefined
): ImageSource[] => {
  const sources: ImageSource[] = [];
  if (set.logo) sources.push({ url: `${set.logo}.webp`, lang: 'de' });
  const en = set.logo
    ? englishAssetBase(set.logo)
    : serieId
      ? `${ASSET_ROOT}/en/${serieId}/${set.id}/logo`
      : undefined;
  if (en && en !== set.logo) sources.push({ url: `${en}.webp`, lang: 'en' });
  if (set.symbol) sources.push({ url: `${set.symbol}.webp`, lang: 'de' });
  return sources;
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

const eurFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
export const formatEur = (v: number | null | undefined) =>
  typeof v === 'number' && Number.isFinite(v) ? eurFormatter.format(v) : '–';

/** Cardmarket-Suche nach Kartenname (idProduct-Links sind nicht stabil dokumentiert). */
export const cardmarketSearchUrl = (name: string) =>
  `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(name)}`;

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
export async function fetchCatalog(): Promise<SerieDetail[]> {
  // "tcgp" = Pokémon TCG Pocket: rein digitale Karten, gehören nicht in den Katalog.
  const series = (await cachedJson<SerieBrief[]>('/series')).filter((s) => !EXCLUDED_SERIES.has(s.id));
  const details = await mapLimit(series, 6, (s) =>
    cachedJson<SerieDetail>(`/series/${encodeURIComponent(s.id)}`)
  );
  return details
    .filter((d): d is SerieDetail => d !== null && Array.isArray(d.sets) && d.sets.length > 0)
    .map((d) => ({ ...d, sets: [...d.sets].reverse() }))
    .sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
}

export const fetchSet = (setId: string) =>
  cachedJson<SetDetail>(`/sets/${encodeURIComponent(setId)}`);

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

const readCardCache = (id: string): CardDetail | null => {
  try {
    const raw = localStorage.getItem(CARD_CACHE_PREFIX + id);
    if (!raw) return null;
    const { at, card } = JSON.parse(raw) as { at: number; card: CardDetail };
    return Date.now() - at < CARD_CACHE_TTL_MS ? card : null;
  } catch {
    return null;
  }
};

const writeCardCache = (card: CardDetail) => {
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
    localStorage.setItem(CARD_CACHE_PREFIX + card.id, JSON.stringify({ at: Date.now(), card: slim }));
  } catch {
    // Speicher voll oder nicht verfügbar: dann eben ohne Cache.
  }
};

export async function fetchCard(cardId: string, signal?: AbortSignal): Promise<CardDetail> {
  const cached = readCardCache(cardId);
  if (cached) return cached;
  const card = await getJson<CardDetail>(`/cards/${encodeURIComponent(cardId)}`, signal);
  writeCardCache(card);
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
  signal?: AbortSignal
) {
  return mapLimit(
    cards,
    6,
    async (c) => {
      const card = await fetchCard(c.id, signal);
      if (!signal?.aborted) onCard(card);
      return card;
    },
    signal
  );
}
