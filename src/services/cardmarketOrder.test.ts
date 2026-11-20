import { describe, expect, it } from 'vitest';
import { parseCardmarketOrder, parseEuro, type PdfTextItem } from './cardmarketOrder';

// Nachgebaut nach einer echten Cardmarket-PDF (Positionen wie von pdf.js),
// Namen und Adressen erfunden.
const at = (y: number, cells: Array<[number, string]>, page = 1): PdfTextItem[] =>
  cells.map(([x, str]) => ({ page, x, y, str }));

const header = (extra: PdfTextItem[] = []): PdfTextItem[] => [
  ...at(802, [[31, 'Einkauf #12345678']]),
  ...at(788, [[31, 'Angekommen 29.03.2019 16:39']]),
  ...at(747, [[31, 'Verkäufer'], [84, '- KartenKiste'], [300, 'Käufer'], [337, '- Sammler1']]),
  ...at(648, [
    [31, 'Unbezahlt: 26.03.2019 15:00'],
    [160, 'Bezahlt: 27.03.2019 15:10'],
    [288, 'Versandt: 27.03.2019 18:36'],
    [418, 'Angekommen: 29.03.2019'],
  ]),
  ...at(577, [[31, 'Artikelwert'], [145, '4,60 EUR']]),
  ...at(563, [[31, 'Versandkosten'], [145, '1,15 EUR']]),
  ...extra,
];

describe('parseEuro', () => {
  it('liest deutsche Beträge', () => {
    expect(parseEuro('2,50 EUR')).toBe(2.5);
    expect(parseEuro('1.234,05 €')).toBe(1234.05);
    expect(parseEuro('Mappe')).toBeNull();
  });
});

describe('parseCardmarketOrder', () => {
  it('liest Kopf und Einzelkarten, auch wenn Zellen zusammenkleben', () => {
    const order = parseCardmarketOrder(
      header([
        ...at(477, [[17, 'Pokémon Einzelkarten:']]),
        ...at(463, [[18, '1'], [31, 'Nidoking'], [220, '11'], [240, 'DE'], [259, 'EX'], [286, 'BS'], [315, 'RH'], [337, 'Mappe'], [537, '2,50 EUR']]),
        ...at(449, [[18, '2'], [31, 'Mr. Mime'], [220, '6'], [240, 'EN NM'], [286, 'JU'], [315, 'RH'], [537, '1,00 EUR']]),
        ...at(435, [[18, '1'], [31, 'Glumanda'], [220, '46'], [240, 'DE NM'], [286, 'BS'], [318, 'C'], [337, 'aus der Mappe, top'], [537, '0,10 EUR']]),
      ])
    );
    expect(order).toMatchObject({ orderId: '12345678', date: '2019-03-27', seller: 'KartenKiste', itemValue: 4.6, currency: 'EUR' });
    expect(order.lines).toHaveLength(3);
    expect(order.lines[0]).toEqual({
      section: 'Pokémon Einzelkarten',
      kind: 'single',
      quantity: 1,
      name: 'Nidoking',
      number: '11',
      language: 'DE',
      condition: 'EX',
      setCode: 'BS',
      rarity: 'RH',
      comment: 'Mappe',
      unitPrice: 2.5,
    });
    expect(order.lines[1]).toMatchObject({ name: 'Mr. Mime', quantity: 2, language: 'EN', condition: 'NM', setCode: 'JU', unitPrice: 1 });
    expect(order.lines[2]).toMatchObject({ number: '46', comment: 'aus der Mappe, top' });
  });

  it('teilt Zeilenpreise durch die Menge, wenn nur so der Artikelwert passt', () => {
    const order = parseCardmarketOrder(
      header([
        ...at(477, [[17, 'Pokémon Einzelkarten:']]),
        ...at(463, [[18, '2'], [31, 'Nidoking'], [220, '11'], [240, 'DE NM'], [286, 'BS'], [315, 'RH'], [537, '4,00 EUR']]),
        ...at(449, [[18, '1'], [31, 'Glumanda'], [220, '46'], [240, 'DE NM'], [286, 'BS'], [318, 'C'], [537, '0,60 EUR']]),
      ])
    );
    expect(order.lines.map((l) => l.unitPrice)).toEqual([2, 0.6]);
  });

  it('ordnet andere Abschnitte als Sealed ein', () => {
    const order = parseCardmarketOrder(
      header([
        ...at(477, [[17, 'Pokémon Booster:']]),
        ...at(463, [[18, '3'], [31, 'Karmesin & Purpur Booster'], [240, 'DE'], [537, '4,60 EUR']]),
      ])
    );
    expect(order.lines[0]).toMatchObject({ kind: 'sealed', quantity: 3, name: 'Karmesin & Purpur Booster', language: 'DE' });
  });

  it('lehnt andere PDFs ab', () => {
    expect(() => parseCardmarketOrder(at(800, [[31, 'Rechnung 2024']]))).toThrow(/Cardmarket/);
  });
});
