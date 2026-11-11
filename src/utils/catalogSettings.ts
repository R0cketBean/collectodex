// Einstellungen rund um Katalogpreise und Cardmarket-Links (#126, #140).

import type { CatalogLang, CatalogVariant } from '../types/models';

/** Welcher Cardmarket-Preis als Vergleichs- und Startwert dient. */
export type PriceBasis = 'trend' | 'avg30' | 'low';

export interface CatalogSettings {
  priceBasis: PriceBasis;
  /** Filter für neu erzeugte Cardmarket-Links. */
  sellerCountry: 'de' | 'all';
  language: 'de' | 'en' | 'jp' | 'all';
  minCondition: 'nm' | 'ex' | 'all';
  /** Ab wie vielen Tagen ein Preis im Preis-Check als fällig gilt. */
  dueAfterDays: number;
  /** Zuletzt gewählte Sprache des Kartenkatalogs. */
  catalogLanguage: CatalogLang;
  /**
   * Vom Nutzer abweichend von der Vorgabe gewählt: Kategorien, deren Einträge
   * der Verknüpfungs-Assistent anbietet (Kategorie → an/aus). Ohne Eintrag
   * gilt die Vorgabe aus `isCardCategory`.
   */
  linkCategories: Record<string, boolean>;
}

export const DEFAULT_CATALOG_SETTINGS: CatalogSettings = {
  priceBasis: 'trend',
  sellerCountry: 'de',
  language: 'de',
  minCondition: 'nm',
  dueAfterDays: 30,
  catalogLanguage: 'de',
  linkCategories: {},
};

export const PRICE_BASIS_LABEL: Record<PriceBasis, string> = {
  trend: 'Trend',
  avg30: 'Ø 30 Tage',
  low: 'Günstigstes Angebot',
};

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Füllt fehlende oder ungültige Felder mit den Vorgaben. */
export const coerceCatalogSettings = (raw: unknown): CatalogSettings => {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CATALOG_SETTINGS;
  const days = Number(r.dueAfterDays);
  return {
    priceBasis: oneOf(r.priceBasis, ['trend', 'avg30', 'low'] as const, d.priceBasis),
    sellerCountry: oneOf(r.sellerCountry, ['de', 'all'] as const, d.sellerCountry),
    language: oneOf(r.language, ['de', 'en', 'jp', 'all'] as const, d.language),
    minCondition: oneOf(r.minCondition, ['nm', 'ex', 'all'] as const, d.minCondition),
    dueAfterDays: Number.isFinite(days) && days >= 1 && days <= 365 ? Math.round(days) : d.dueAfterDays,
    catalogLanguage: oneOf(r.catalogLanguage, ['de', 'en', 'ja'] as const, d.catalogLanguage),
    linkCategories: Object.fromEntries(
      Object.entries(
        typeof r.linkCategories === 'object' && r.linkCategories !== null && !Array.isArray(r.linkCategories)
          ? r.linkCategories
          : {}
      ).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')
    ),
  };
};

// Cardmarket-Kennzahlen: Verkäuferland 7 = Deutschland; Sprache 1 = Englisch,
// 3 = Deutsch, 7 = Japanisch; Mindestzustand 2 = Near Mint, 3 = Excellent.
const LANGUAGE_ID = { de: '3', en: '1', jp: '7' } as const;
const CONDITION_ID = { nm: '2', ex: '3' } as const;

/** Query-Teil für Cardmarket-Links, z. B. `sellerCountry=7&language=3&minCondition=2`. */
export const buildCardmarketFilter = (
  s: Pick<CatalogSettings, 'sellerCountry' | 'language' | 'minCondition'>,
  /** Sprache der Karte; hat Vorrang vor der eingestellten Sprache. */
  cardLanguage?: CatalogLang
): string =>
  [
    s.sellerCountry === 'de' ? 'sellerCountry=7' : null,
    cardLanguage && cardLanguage !== 'de'
      ? `language=${LANGUAGE_ID[cardLanguage === 'ja' ? 'jp' : cardLanguage]}`
      : s.language !== 'all'
        ? `language=${LANGUAGE_ID[s.language]}`
        : null,
    s.minCondition !== 'all' ? `minCondition=${CONDITION_ID[s.minCondition]}` : null,
  ]
    .filter(Boolean)
    .join('&');

interface PriceFields {
  trend: number | null;
  low: number | null;
  avg30: number | null;
  reverseTrend: number | null;
  reverseLow: number | null;
}

/**
 * Katalogpreis nach gewählter Basis. Für Reverse Holo kennt Cardmarket keinen
 * 30-Tage-Schnitt in den Daten, dort gilt dann der Trend. Fehlt der gewählte
 * Wert, fällt die Auswahl auf den Trend zurück.
 */
export const pickCatalogPrice = (
  price: PriceFields | null | undefined,
  basis: PriceBasis,
  variant: CatalogVariant = 'normal'
): number | null => {
  if (!price) return null;
  if (variant === 'reverse') return (basis === 'low' ? price.reverseLow : null) ?? price.reverseTrend;
  const chosen = basis === 'low' ? price.low : basis === 'avg30' ? price.avg30 : price.trend;
  return chosen ?? price.trend;
};
