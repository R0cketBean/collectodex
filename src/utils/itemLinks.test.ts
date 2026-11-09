import { describe, expect, it } from 'vitest';
import { resolveItemLink, normalizeLinkUrl } from './itemLinks';
import type {
  AttributeDefinition,
  CollectionItem,
} from '../types/models';

const attr = (overrides: Partial<AttributeDefinition>): AttributeDefinition => ({
  id: overrides.id ?? 'x',
  name: overrides.name ?? overrides.id ?? 'X',
  type: overrides.type ?? 'text',
  required: overrides.required ?? false,
  isVisible: overrides.isVisible ?? true,
  isCalculated: overrides.isCalculated ?? false,
  order: overrides.order ?? 0,
  ...overrides,
});

const item = (overrides: Partial<CollectionItem>): CollectionItem => ({
  id: 'i1',
  categoryId: 'sealed',
  values: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('resolveItemLink', () => {
  it('liefert undefined, wenn item.links fehlt', () => {
    expect(resolveItemLink(item({}), attr({ id: 'name' }))).toBeUndefined();
  });

  it('liefert undefined, wenn für die Spalte kein Link existiert', () => {
    const i = item({ links: { name: 'https://example.com/n' } });
    expect(resolveItemLink(i, attr({ id: 'price' }))).toBeUndefined();
  });

  it('liefert links[attr.id] für nicht-Name-Spalten', () => {
    const i = item({ links: { price: 'https://example.com/p' } });
    expect(resolveItemLink(i, attr({ id: 'price' }))).toBe(
      'https://example.com/p'
    );
  });

  it('bevorzugt links.product gegenüber links.name in der Name-Spalte', () => {
    const i = item({
      links: {
        name: 'https://example.com/old-name',
        product: 'https://example.com/product',
      },
    });
    expect(resolveItemLink(i, attr({ id: 'name' }))).toBe(
      'https://example.com/product'
    );
  });

  it('fällt auf links.name zurück, wenn nur das gesetzt ist', () => {
    const i = item({ links: { name: 'https://example.com/n' } });
    expect(resolveItemLink(i, attr({ id: 'name' }))).toBe(
      'https://example.com/n'
    );
  });

  it('liefert für die Name-Spalte den product-Link, auch wenn name fehlt', () => {
    const i = item({ links: { product: 'https://example.com/p' } });
    expect(resolveItemLink(i, attr({ id: 'name' }))).toBe(
      'https://example.com/p'
    );
  });

  it('ignoriert links.product für Spalten, die nicht "name" sind', () => {
    const i = item({
      links: { product: 'https://example.com/p' },
    });
    expect(resolveItemLink(i, attr({ id: 'price' }))).toBeUndefined();
  });
});

describe('normalizeLinkUrl', () => {
  it('ergänzt https:// wenn das Protokoll fehlt', () => {
    expect(normalizeLinkUrl('cardmarket.com/x')).toBe(
      'https://cardmarket.com/x'
    );
  });

  it('lässt http:// und https:// unverändert', () => {
    expect(normalizeLinkUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeLinkUrl('https://example.com')).toBe('https://example.com');
  });

  it('trimmt Leerzeichen', () => {
    expect(normalizeLinkUrl('  https://example.com  ')).toBe(
      'https://example.com'
    );
    expect(normalizeLinkUrl('  cardmarket.com/x  ')).toBe(
      'https://cardmarket.com/x'
    );
  });

  it('liefert leeren String für leere/nur-Leerzeichen-Eingaben', () => {
    expect(normalizeLinkUrl('')).toBe('');
    expect(normalizeLinkUrl('   ')).toBe('');
  });
});
