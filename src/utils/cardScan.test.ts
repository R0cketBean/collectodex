import { describe, expect, it } from 'vitest';
import type { OcrLine } from '../types/electron';
import {
  isConfident,
  localIdMatches,
  nameSimilarity,
  normalizeCardNumber,
  parseScan,
  rankCandidates,
  type ScanCandidate,
} from './cardScan';

const line = (text: string, y: number, extra: Partial<OcrLine> = {}): OcrLine => ({
  text,
  confidence: 1,
  pass: 'full',
  x: 0.2,
  y,
  w: 0.3,
  h: 0.04,
  ...extra,
});
const bottom = (text: string) => line(text, 0.94, { pass: 'bottom', x: 0.05, h: 0.01 });

// Zeilen wie von Apple Vision für echte TCGdex-Kartenbilder geliefert.
const riesenzahn: OcrLine[] = [
  line('BASIS', 0.04, { x: 0.04, h: 0.02 }),
  line('Riesenzahn ex', 0.04, { x: 0.19 }),
  line('кр 250 g', 0.04, { x: 0.7 }),
  line('G SVI DE 123/198 **', 0.94, { x: 0.06, h: 0.01 }),
  line('©2023 Pokémon/Nintendo/Creatures/GAME FREAK', 0.98, { x: 0.31, h: 0.01 }),
  bottom('SVI DE'),
  bottom('123/198'),
];

describe('parseScan', () => {
  it('liest Set-Code, Sprache, Nummer, Gesamtzahl und Name', () => {
    expect(parseScan(riesenzahn)).toEqual({ setCode: 'SVI', lang: 'DE', number: '123', total: 198, name: 'Riesenzahn ex' });
  });

  it('bevorzugt den vergrößerten Durchgang bei verlesener Gesamtzahl', () => {
    const info = parseScan([
      line('PHASEZ', 0.04, { x: 0.02, h: 0.02 }),
      line('GlurakeX', 0.04, { x: 0.19 }),
      line('Entwickelt sich aus Glutexo', 0.09, { x: 0.19, h: 0.02 }),
      line('G MEW DE 006/7165 **', 0.94, { x: 0.05, h: 0.01 }),
      bottom('G MEW DE 006/165 *'),
    ]);
    expect(info).toEqual({ setCode: 'MEW', lang: 'DE', number: '6', total: 165, name: 'GlurakeX' });
  });

  it('kommt ohne Set-Code aus (Schwert & Schild)', () => {
    const info = parseScan([line('VSTAR®', 0.04, { x: 0.04, h: 0.02 }), line('Lugia / STAR', 0.04, { x: 0.18 }), bottom('F'), bottom('139/195')]);
    expect(info).toEqual({ number: '139', total: 195, name: 'Lugia / STAR' });
  });

  it('erkennt Secret Rares mit höherer Nummer als die Gesamtzahl', () => {
    expect(parseScan([bottom('SSP DE'), bottom('238/191')])).toMatchObject({ setCode: 'SSP', number: '238', total: 191 });
  });

  it('liest Trainer-Galerie-Nummern mit Präfix', () => {
    expect(parseScan([bottom('TG05/TG30')])).toMatchObject({ number: 'TG5', total: 30 });
  });

  it('repariert typische Lesefehler in Ziffern', () => {
    expect(parseScan([bottom('O5O/ 167')])).toMatchObject({ number: '50', total: 167 });
  });

  it('liest Promos ohne Gesamtzahl', () => {
    expect(parseScan([bottom('SVP DE 045')])).toMatchObject({ setCode: 'SVP', lang: 'DE', number: '45' });
  });

  it('nimmt Bruchstücke nicht als Set-Code', () => {
    expect(parseScan([bottom('M DE'), bottom('050/167 •')])).toEqual({ number: '50', total: 167 });
  });

  it('übergeht Kopfzeilen wie Stufe und KP beim Namen', () => {
    expect(parseScan([line('PHASE1', 0.04, { x: 0.1 }), line('KP 120', 0.04, { x: 0.6 })]).name).toBeUndefined();
  });

  it('entfernt die Stufe vor dem Namen und findet den Namen auch etwas tiefer', () => {
    expect(parseScan([line('PHASEz Glurak', 0.1, { x: 0.06 }), line('KP 170', 0.1, { x: 0.7 })]).name).toBe('Glurak');
    expect(parseScan([line('PHASEJ', 0.12, { x: 0.12, h: 0.02 }), line('Stahlos', 0.13, { x: 0.24 })]).name).toBe('Stahlos');
  });

  it('liest eine Promo-Nummer, die als eigene Zeile neben dem Code steht', () => {
    const at = (text: string, x: number) => line(text, 0.94, { pass: 'bottom', x, h: 0.01 });
    expect(parseScan([at('J', 0.02), at('MEP DE', 0.05), at('116', 0.15)])).toMatchObject({ setCode: 'MEP', number: '116' });
  });

  it('richtet sich am Text aus, wenn die Karte im Foto nicht erkannt wurde', () => {
    // Karte in der Hand: Text nimmt nur die Mitte des Fotos ein.
    const info = parseScan([
      line('PHASEZ', 0.12, { x: 0.19, h: 0.01 }),
      line('TurtokCx', 0.12, { x: 0.28, h: 0.02, w: 0.15 }),
      line('Zwillingsdüsen', 0.54, { x: 0.38, w: 0.2 }),
      line('Illustr. PLANETA Yamashita', 0.69, { x: 0.21, w: 0.2 }),
      line('G MEW DE', 0.71, { x: 0.22, w: 0.05 }),
      line('184/165', 0.71, { x: 0.28, w: 0.05 }),
      line('kampfunfähig ist, nimmt dein Gegner 2 Preiskarten.', 0.69, { x: 0.43, w: 0.37 }),
    ]);
    expect(info).toMatchObject({ setCode: 'MEW', number: '184', total: 165, name: 'TurtokCx' });
  });

  it('liefert ein leeres Ergebnis ohne Text', () => {
    expect(parseScan([])).toEqual({});
  });
});

describe('Nummern', () => {
  it('vereinheitlicht führende Nullen und Präfixe', () => {
    expect(normalizeCardNumber('006')).toBe('6');
    expect(normalizeCardNumber('tg05')).toBe('TG5');
    expect(normalizeCardNumber('SWSH139')).toBe('SWSH139');
    expect(localIdMatches('006', '6')).toBe(true);
    expect(localIdMatches('TG05', 'TG5')).toBe(true);
    expect(localIdMatches('139', 'SWSH139')).toBe(false);
    expect(localIdMatches('139', undefined)).toBe(false);
  });
});

describe('nameSimilarity', () => {
  it('verzeiht typische Lesefehler', () => {
    expect(nameSimilarity('GlurakeX', 'Glurak-ex')).toBe(1);
    expect(nameSimilarity('Riesenzahn ex', 'Riesenzahn-ex')).toBe(1);
    expect(nameSimilarity('Lugia / STAR', 'Lugia-VSTAR')).toBeGreaterThan(0.8);
    expect(nameSimilarity('Pikachuex', 'Pikachu-ex')).toBe(1);
  });

  it('bewertet fremde Namen niedrig', () => {
    expect(nameSimilarity('Milotic', 'Forstellka')).toBeLessThan(0.4);
    expect(nameSimilarity(undefined, 'Milotic')).toBe(0);
  });
});

describe('rankCandidates', () => {
  const card = (over: Partial<ScanCandidate>): ScanCandidate => ({
    cardId: 'x-1',
    setId: 'x',
    setName: 'Set',
    localId: '1',
    name: 'Name',
    ...over,
  });

  it('setzt die Karte mit Nummer, Gesamtzahl und Name nach vorn', () => {
    const info = { number: '139', total: 195, name: 'Lugia / STAR' };
    const ranked = rankCandidates(
      [
        card({ cardId: 'swsh6-139', localId: '139', name: 'Galar-Flunschlik', official: 198 }),
        card({ cardId: 'swsh12-139', localId: '139', name: 'Lugia-VSTAR', official: 195 }),
      ],
      info
    );
    expect(ranked.map((r) => r.cardId)).toEqual(['swsh12-139', 'swsh6-139']);
    expect(ranked[0].matches).toEqual(['number', 'total', 'name']);
    expect(isConfident(ranked)).toBe(true);
  });

  it('wertet den Set-Code', () => {
    const ranked = rankCandidates([card({ cardId: 'sv01-123', localId: '123', setCode: 'SVI', official: 198 })], {
      setCode: 'SVI',
      number: '123',
      total: 198,
    });
    expect(ranked[0].matches).toEqual(['code', 'number', 'total']);
    // Code, Nummer und Gesamtzahl sind eindeutig – sicher auch ohne Namen (Holo).
    expect(isConfident(ranked)).toBe(true);
  });

  it('ist unsicher, wenn der Name nicht passt oder zwei Treffer gleichauf liegen', () => {
    const info = { number: '50', total: 167 };
    const ranked = rankCandidates(
      [card({ cardId: 'a-050', localId: '050', official: 167 }), card({ cardId: 'b-050', localId: '050', official: 167 })],
      info
    );
    expect(ranked).toHaveLength(2);
    expect(isConfident(ranked)).toBe(false);
  });

  it('lässt Kandidaten ohne Übereinstimmung und Doppelte weg', () => {
    const ranked = rankCandidates(
      [card({ cardId: 'a-1' }), card({ cardId: 'a-1' }), card({ cardId: 'b-7', localId: '7' })],
      { number: '1' }
    );
    expect(ranked.map((r) => r.cardId)).toEqual(['a-1']);
  });
});
