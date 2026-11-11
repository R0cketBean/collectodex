import { describe, expect, it } from 'vitest';
import {
  buildCardmarketFilter,
  coerceCatalogSettings,
  DEFAULT_CATALOG_SETTINGS,
  pickCatalogPrice,
} from './catalogSettings';

describe('coerceCatalogSettings', () => {
  it('füllt Fehlendes und Ungültiges mit den Vorgaben', () => {
    expect(coerceCatalogSettings(null)).toEqual(DEFAULT_CATALOG_SETTINGS);
    expect(coerceCatalogSettings({ priceBasis: 'quatsch', language: 'en', dueAfterDays: 0 })).toEqual({
      ...DEFAULT_CATALOG_SETTINGS,
      language: 'en',
    });
    expect(coerceCatalogSettings({ dueAfterDays: '14' }).dueAfterDays).toBe(14);
  });

  it('behält die Kategorienwahl für den Verknüpfungs-Assistenten und verwirft Unbrauchbares', () => {
    expect(coerceCatalogSettings({ linkCategories: { sealed: true, singles: false, kaputt: 'ja' } }).linkCategories).toEqual({
      sealed: true,
      singles: false,
    });
    expect(coerceCatalogSettings({ linkCategories: ['sealed'] }).linkCategories).toEqual({});
  });
});

describe('buildCardmarketFilter', () => {
  it('entspricht in der Vorgabe dem bisherigen festen Filter', () => {
    expect(buildCardmarketFilter(DEFAULT_CATALOG_SETTINGS)).toBe('sellerCountry=7&language=3&minCondition=2');
  });

  it('lässt abgewählte Teile weg', () => {
    expect(buildCardmarketFilter({ sellerCountry: 'all', language: 'jp', minCondition: 'all' })).toBe('language=7');
    expect(buildCardmarketFilter({ sellerCountry: 'all', language: 'all', minCondition: 'all' })).toBe('');
    expect(buildCardmarketFilter({ sellerCountry: 'de', language: 'en', minCondition: 'ex' })).toBe(
      'sellerCountry=7&language=1&minCondition=3'
    );
  });
});

describe('Sprache der Karte im Link', () => {
  it('überstimmt die eingestellte Sprache für englische und japanische Karten', () => {
    expect(buildCardmarketFilter(DEFAULT_CATALOG_SETTINGS, 'ja')).toBe('sellerCountry=7&language=7&minCondition=2');
    expect(buildCardmarketFilter(DEFAULT_CATALOG_SETTINGS, 'en')).toBe('sellerCountry=7&language=1&minCondition=2');
    expect(buildCardmarketFilter(DEFAULT_CATALOG_SETTINGS, 'de')).toBe('sellerCountry=7&language=3&minCondition=2');
  });
});

describe('pickCatalogPrice', () => {
  const price = { trend: 10, low: 6, avg30: 9, reverseTrend: 3, reverseLow: 2 };

  it('wählt nach Basis', () => {
    expect(pickCatalogPrice(price, 'trend')).toBe(10);
    expect(pickCatalogPrice(price, 'avg30')).toBe(9);
    expect(pickCatalogPrice(price, 'low')).toBe(6);
  });

  it('nimmt für Reverse Holo die Reverse-Preise', () => {
    expect(pickCatalogPrice(price, 'trend', 'reverse')).toBe(3);
    expect(pickCatalogPrice(price, 'avg30', 'reverse')).toBe(3);
    expect(pickCatalogPrice(price, 'low', 'reverse')).toBe(2);
  });

  it('fällt auf den Trend zurück und kommt ohne Preis aus', () => {
    expect(pickCatalogPrice({ ...price, avg30: null }, 'avg30')).toBe(10);
    expect(pickCatalogPrice(null, 'trend')).toBeNull();
  });
});
