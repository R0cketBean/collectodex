import { describe, expect, it } from 'vitest';
import { JAPANESE_SET_ALIASES, JAPANESE_SET_NAMES, japaneseSetName } from './japaneseSetNames';

describe('Englische Namen japanischer Sets', () => {
  it('kennt die gängigen Sets', () => {
    expect(japaneseSetName('SV2a')).toBe('Pokémon Card 151');
    expect(japaneseSetName('PMCG3')).toBe('Mystery of the Fossils');
    expect(japaneseSetName('gibtsnicht')).toBeUndefined();
  });

  it('enthält keine leeren Namen und keine Set-Kürzel im Namen', () => {
    for (const [id, name] of Object.entries(JAPANESE_SET_NAMES)) {
      expect(name.trim(), id).toBe(name);
      expect(name.length, id).toBeGreaterThan(0);
      expect(name.toLowerCase().startsWith(`${id.toLowerCase()}:`), id).toBe(false);
    }
  });

  it('führt abweichende Schreibweisen nur für Sets mit Namen', () => {
    for (const id of Object.keys(JAPANESE_SET_ALIASES)) expect(JAPANESE_SET_NAMES[id], id).toBeTruthy();
  });
});
