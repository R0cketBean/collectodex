import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../types/models';
import { cardmarketProductUrl } from '../services/tcgdex';
import { buildCatalogItem, catalogItemName, catalogLangOfItem } from './catalogItem';

const singles = DEFAULT_CATEGORIES.find((c) => c.id === 'singles')!;
const source = {
  cardId: 'sv03.5-199',
  setId: 'sv03.5',
  setName: '151',
  name: 'Glurak-ex',
  localId: '199',
  variant: 'normal' as const,
  price: 317.02,
  imageUrl: 'https://assets.tcgdex.net/de/sv/sv03.5/199/high.webp',
  productUrl: cardmarketProductUrl(733794, 'Glurak-ex'),
};

describe('catalogItemName', () => {
  it('nimmt nur den Kartennamen und kennzeichnet Reverse Holo', () => {
    expect(catalogItemName(source)).toBe('Glurak-ex');
    expect(catalogItemName({ ...source, variant: 'reverse' })).toBe('Glurak-ex (Reverse Holo)');
  });
});

describe('buildCatalogItem', () => {
  it('belegt die Felder der Zielkategorie vor', () => {
    const draft = buildCatalogItem(singles, source, '2026-11-10');
    expect(draft.values).toMatchObject({
      name: 'Glurak-ex',
      quantity: 1,
      purchasePrice: 0,
      currentValue: 317.02,
      addedDate: '2026-11-10',
      expansion: '151',
      language: 'deutsch',
      condition: '',
    });
    // Berechnete Felder werden nicht gespeichert.
    expect(draft.values).not.toHaveProperty('totalValue');
    expect(draft.images).toEqual({ image: source.imageUrl });
    expect(draft.catalog).toEqual({ cardId: 'sv03.5-199', setId: 'sv03.5', variant: 'normal' });
  });

  it('verlinkt das Cardmarket-Produkt mit den Standardfiltern', () => {
    expect(buildCatalogItem(singles, source).links.product).toBe(
      'https://www.cardmarket.com/de/Pokemon/Products?idProduct=733794&sellerCountry=7&language=3&minCondition=2'
    );
  });

  it('kommt ohne Preis, Bild und Produktnummer aus', () => {
    const draft = buildCatalogItem(singles, { ...source, price: null, imageUrl: undefined, productUrl: undefined });
    expect(draft.values.currentValue).toBe(0);
    expect(draft.images).toEqual({});
    expect(draft.links).toEqual({});
  });
});

describe('Sprache', () => {
  it('leitet die Katalogsprache aus dem Feld „Sprache“ ab', () => {
    expect(['Japanisch', 'japanisch', 'JP'].map(catalogLangOfItem)).toEqual(['ja', 'ja', 'ja']);
    expect(['Englisch', 'english', 'EN'].map(catalogLangOfItem)).toEqual(['en', 'en', 'en']);
    expect(['Deutsch', '', undefined, 'Französisch'].map(catalogLangOfItem)).toEqual(['de', 'de', 'de', 'de']);
  });

  it('setzt Sprache und Verknüpfung für japanische Karten', () => {
    const draft = buildCatalogItem(singles, { ...source, cardId: 'SV2a-201', setId: 'SV2a', lang: 'ja' });
    expect(draft.values.language).toBe('japanisch');
    expect(draft.catalog).toEqual({ cardId: 'SV2a-201', setId: 'SV2a', variant: 'normal', lang: 'ja' });
  });

  it('nimmt das deutsche Wort, wenn „Sprache“ ein Freitextfeld ist', () => {
    const category = { attributes: [{ id: 'language', name: 'Sprache', type: 'text' as const, required: false, order: 1 }] };
    expect(buildCatalogItem(category, { ...source, lang: 'en' }).values.language).toBe('Englisch');
  });
});
