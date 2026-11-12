import { describe, expect, it } from 'vitest';
import type { CollectionItem } from '../types/models';
import {
  candidateSetIds,
  findSetIds,
  isCardCategory,
  linkCategoryIds,
  linkNumberMatches,
  linkNumberWithSetCode,
  manualCandidates,
  parseCardmarketLink,
  suggestMatch,
} from './catalogMatch';

const item = (values: Record<string, unknown>, product?: string): CollectionItem =>
  ({
    id: 'i',
    categoryId: 'singles',
    values,
    ...(product ? { links: { product } } : {}),
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as CollectionItem;

const CM = 'https://www.cardmarket.com/de/Pokemon/Products/Singles';
const sets = [
  { id: 'base1', names: ['Grundset', 'Base Set'] },
  { id: 'sv03.5', names: ['151', '151'] },
  { id: 'swsh12.5', names: ['Zenit der Könige', 'Crown Zenith'] },
];
const base1 = [
  { id: 'base1-2', localId: '2', name: 'Turtok' },
  { id: 'base1-4', localId: '4', name: 'Glurak' },
  { id: 'base1-46', localId: '46', name: 'Glumanda' },
];
const s151 = [
  { id: 'sv03.5-006', localId: '006', name: 'Glurak-ex' },
  { id: 'sv03.5-183', localId: '183', name: 'Glurak-ex' },
  { id: 'sv03.5-001', localId: '001', name: 'Bisasam' },
];

describe('parseCardmarketLink', () => {
  it('liest Set und Nummer', () => {
    expect(parseCardmarketLink(`${CM}/Base-Set/Charizard-V1-BS4?language=3`)).toEqual({ setSlug: 'Base-Set', number: '4' });
    expect(parseCardmarketLink(`${CM}/151/Charizard-ex-MEW006`)).toEqual({ setSlug: '151', number: '6' });
    expect(parseCardmarketLink(`${CM}/Crown-Zenith/Mewtwo-VSTAR-GG44`)?.number).toBe('44');
  });

  it('hält eine reine Versionsangabe nicht für die Nummer', () => {
    expect(parseCardmarketLink(`${CM}/Base-Set/Charizard-V1`)).toEqual({ setSlug: 'Base-Set', number: null });
  });

  it('liefert null für alles, was kein Einzelkarten-Link ist', () => {
    expect(parseCardmarketLink(undefined)).toBeNull();
    expect(parseCardmarketLink('https://www.cardmarket.com/de/Pokemon/Products/Tins/Foo')).toBeNull();
  });
});

describe('Sets finden', () => {
  it('vergleicht deutsche und englische Namen ohne Rücksicht auf Schreibweise', () => {
    expect(findSetIds(sets, 'Base-Set')).toEqual(['base1']);
    expect(findSetIds(sets, 'zenit der koenige')).toEqual([]);
    expect(findSetIds(sets, 'Zenit der Könige')).toEqual(['swsh12.5']);
    expect(findSetIds(sets, '')).toEqual([]);
  });

  it('nimmt Link und Erweiterung zusammen', () => {
    expect(candidateSetIds(sets, item({ expansion: '151' }, `${CM}/Base-Set/Charizard-V1-BS4`))).toEqual(['base1', 'sv03.5']);
    expect(candidateSetIds(sets, item({ expansion: 'Tag All Stars' }))).toEqual([]);
  });
});

describe('suggestMatch', () => {
  const cards = { base1, 'sv03.5': s151 };

  it('ist sicher, wenn Nummer und Name übereinstimmen', () => {
    const s = suggestMatch(item({ name: 'Glurak' }, `${CM}/Base-Set/Charizard-V1-BS4`), ['base1'], cards);
    expect(s.status).toBe('sure');
    expect(s.best?.card.id).toBe('base1-4');
  });

  it('unterscheidet gleichnamige Karten über die Nummer', () => {
    const s = suggestMatch(item({ name: 'Glurak ex' }, `${CM}/151/Charizard-ex-MEW183`), ['sv03.5'], cards);
    expect(s).toMatchObject({ status: 'sure', best: { card: { id: 'sv03.5-183' } } });
  });

  it('legt zur Prüfung vor, wenn die Nummer passt, der Name aber nicht', () => {
    const s = suggestMatch(item({ name: 'Charizard' }, `${CM}/Base-Set/Charizard-V1-BS4`), ['base1'], cards);
    expect(s.status).toBe('review');
    expect(s.best?.card.id).toBe('base1-4');
    expect(s.reason).toBe('Nummer passt, Name weicht ab');
  });

  it('ist ohne Nummer nur bei eindeutigem Namen sicher', () => {
    expect(suggestMatch(item({ name: 'Bisasam' }), ['sv03.5'], cards).status).toBe('sure');
    const ambiguous = suggestMatch(item({ name: 'Glurak-ex' }), ['sv03.5'], cards);
    expect(ambiguous.status).toBe('review');
    expect(ambiguous.candidates).toHaveLength(2);
  });

  it('übernimmt japanische Karten nie von selbst', () => {
    const s = suggestMatch(item({ name: 'Glurak', language: 'Japanisch' }, `${CM}/Base-Set/Charizard-BS4`), ['base1'], cards);
    expect(s.status).toBe('review');
  });

  it('meldet keinen Treffer, wenn Set oder Karte fehlen', () => {
    expect(suggestMatch(item({ name: 'Glurak' }), [], cards).status).toBe('none');
    expect(suggestMatch(item({ name: 'Mewtu' }), ['base1'], cards).status).toBe('none');
    expect(suggestMatch(item({ name: 'Glurak' }), ['unbekannt'], cards).status).toBe('none');
  });
});

describe('manualCandidates', () => {
  it('listet alle Karten des Sets, namensgleiche zuerst, sonst nach Nummer', () => {
    const cards = [
      { id: 'x-10', localId: '10', name: 'Bisaflor' },
      { id: 'x-2', localId: '2', name: 'Turtok' },
      { id: 'x-1', localId: '1', name: 'Glurak' },
      { id: 'x-15', localId: '15', name: 'Turtok' },
    ];
    expect(manualCandidates(item({ name: 'Turtok' }), 'x', cards).map((c) => c.card.id)).toEqual([
      'x-2',
      'x-15',
      'x-1',
      'x-10',
    ]);
    expect(manualCandidates(item({}), 'x', cards)[0]).toEqual({ setId: 'x', card: cards[2] });
  });
});

describe('Zuordnung über Nummer und Zweitnamen', () => {
  const cards = [
    { id: 'SV2a-006', localId: '006', name: 'リザードンex' },
    { id: 'SV2a-201', localId: '201', name: 'リザードンex' },
    { id: 'SV2a-001', localId: '001', name: 'フシギダネ' },
  ];

  it('stellt bei der Auswahl von Hand die Karte mit der Nummer aus dem Link voran', () => {
    const entry = item({ name: 'Glurak ex', language: 'Japanisch' }, `${CM}/Pokemon-Card-151/Charizard-ex-V3-sv2a201`);
    expect(manualCandidates(entry, 'ja:SV2a', cards)[0]).toEqual({ setId: 'ja:SV2a', card: cards[1] });
  });

  it('erkennt englische Karten auch am deutschen Namen', () => {
    const english = { 'en:base1': [{ id: 'base1-4', localId: '4', name: 'Charizard', altName: 'Glurak' }] };
    const s = suggestMatch(item({ name: 'Glurak', language: 'Englisch' }, `${CM}/Base-Set/Charizard-V1-BS4`), ['en:base1'], english);
    expect(s).toMatchObject({ status: 'sure', best: { setId: 'en:base1' } });
  });
});

describe('Japanische Karten über Set-Kürzel und Nummer im Link', () => {
  const ja = (name: string, product: string) => item({ name, language: 'japanisch' }, `${CM}/${product}`);
  const jaSets = [
    { id: 'SV2a', names: ['Pokémon Card 151', 'ポケモンカード151'] },
    { id: 'SM9', names: ['Tag Bolt', 'タッグボルト'] },
    { id: 'SM12a', names: ['TAG TEAM GX: Tag All Stars', 'TAG TEAM GX タッグオールスターズ', 'Tag All Stars'] },
  ];
  const cards = {
    'ja:SV2a': [
      { id: 'SV2a-006', localId: '006', name: 'リザードンex' },
      { id: 'SV2a-201', localId: '201', name: 'リザードンex' },
    ],
    'ja:SM9': [{ id: 'SM9-001', localId: '001', name: 'セレビィ&フシギバナGX' }],
  };

  it('findet das japanische Set über den englischen Namen und die Cardmarket-Schreibweise', () => {
    expect(candidateSetIds(jaSets, item({ name: 'Glurak ex', expansion: 'Pokémon Card 151' }))).toEqual(['SV2a']);
    expect(candidateSetIds(jaSets, ja('Willi', 'Tag-All-Stars/Will'))).toEqual(['SM12a']);
  });

  it('trennt Set-Kürzel und Nummer, auch wenn das Kürzel auf eine Ziffer endet', () => {
    const celebi = ja('Celebi & Venusaur GX', 'Tag-Bolt/Celebi-Venusaur-GX-V1-sm9001');
    expect(parseCardmarketLink(celebi.links?.product)?.number).toBe('9001');
    expect(linkNumberWithSetCode(celebi, 'ja:SM9')).toBe('1');
    expect(linkNumberMatches(celebi, cards['ja:SM9'][0], 'ja:SM9')).toBe(true);
    expect(linkNumberMatches(celebi, cards['ja:SM9'][0])).toBe(false);
    // Ein anderes Set oder ein Buchstabe nach dem Kürzel (SM9a) passt nicht.
    expect(linkNumberWithSetCode(celebi, 'ja:SV2a')).toBeNull();
    expect(linkNumberWithSetCode(ja('X', 'Night-Unison/X-sm9a012'), 'ja:SM9')).toBeNull();
    expect(linkNumberWithSetCode(item({ name: 'Glurak' }, `${CM}/Base-Set/Charizard-V1-BS4`), 'base1')).toBeNull();
  });

  it('ist sicher, wenn Set-Kürzel und Nummer im Link zum gefundenen Set passen', () => {
    const glurak = suggestMatch(ja('Glurak ex', 'Pokemon-Card-151/Charizard-ex-V3-sv2a201'), ['ja:SV2a'], cards);
    expect(glurak).toMatchObject({ status: 'sure', best: { setId: 'ja:SV2a', card: { id: 'SV2a-201' } } });
    const celebi = suggestMatch(ja('Celebi & Venusaur GX', 'Tag-Bolt/Celebi-Venusaur-GX-V1-sm9001'), ['ja:SM9'], cards);
    expect(celebi).toMatchObject({ status: 'sure', best: { card: { id: 'SM9-001' } } });
  });

  it('hält japanische und sehr kurze Katalognamen nicht für eine Übereinstimmung', () => {
    // „リザードンex“ würde vereinheitlicht zu „ex“, ein Kartenname „d“ steckt in „Despotar“.
    const odd = { 'ja:neo2': [{ id: 'neo2-025', localId: '025', name: 'd' }, ...cards['ja:SV2a']] };
    expect(suggestMatch(ja('Despotar ex', 'Crossing-the-Ruins/Tyranitar-CTR'), ['ja:neo2'], odd).status).toBe('none');
  });

  it('bleibt ohne Set-Kürzel im Link bei „kein Treffer“ oder „bitte prüfen“', () => {
    expect(suggestMatch(ja('Glurak ex', 'Pokemon-Card-151/Charizard-ex'), ['ja:SV2a'], cards).status).toBe('none');
    // Nummer ohne Set-Kürzel: nur ein Vorschlag.
    expect(suggestMatch(ja('Glurak ex', 'Pokemon-Card-151/Charizard-ex-201'), ['ja:SV2a'], cards).status).toBe('review');
  });
});

describe('Kategorien mit Karten', () => {
  const attr = (id: string) => ({ id, name: id, type: 'text' as const, required: false, order: 0 });
  const categories = [
    { id: 'singles', attributes: [attr('name'), attr('expansion')] },
    { id: 'graded', attributes: [attr('name'), attr('expansion'), attr('grade')] },
    // Sealed führt die Erweiterung als selbst angelegtes Feld mit eigener Kennung.
    { id: 'sealed', attributes: [attr('name'), attr('attr_1234')] },
    { id: 'cat_zubehoer', attributes: [attr('name')] },
  ];

  it('nimmt in der Vorgabe nur Kategorien mit dem Feld „Erweiterung“', () => {
    expect(isCardCategory(categories[0])).toBe(true);
    expect(isCardCategory(categories[2])).toBe(false);
    expect([...linkCategoryIds(categories)]).toEqual(['singles', 'graded']);
  });

  it('folgt der abweichenden Wahl des Nutzers', () => {
    expect([...linkCategoryIds(categories, { graded: false, cat_zubehoer: true })]).toEqual(['singles', 'cat_zubehoer']);
  });
});
