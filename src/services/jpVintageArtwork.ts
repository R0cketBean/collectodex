// Kartenscanner (#180): japanische Vintage-Karten (Grundset bis e-Serie)
// tragen keine Kartennummer, und TCGdex hat für diese Sets keine Bilder. Ihre
// Artworks gibt es aber in den englischen Sets. Die Tabelle ordnet jeder
// japanischen Pokémon-Karte die englischen Karten desselben Pokémon zu
// (erzeugt mit scripts/build-jp-vintage-artwork.mjs); unter mehreren
// entscheidet der Bildvergleich.

import table from '../data/jpVintageArtwork.json';
import type { VisualCard } from './imageMatch';
import { englishCardImageBase } from './tcgdex';

const ARTWORKS: Record<string, string[]> = table;

// Serie der englischen Sets – für die Bildadresse bei TCGdex.
const SERIES: Array<[RegExp, string]> = [
  [/^base/, 'base'],
  [/^gym/, 'gym'],
  [/^neo/, 'neo'],
  [/^ecard/, 'ecard'],
];

/** Japanische Sets, die die Tabelle abdeckt („PMCG1“ … „E5“). */
export const JP_VINTAGE_SETS: string[] = [...new Set(Object.keys(ARTWORKS).map((id) => id.replace(/-[^-]+$/, '')))];

/** Englische Karten mit dem Artwork der japanischen Karte; leer, wenn keine bekannt ist. */
export const englishArtworks = (cardId: string): VisualCard[] =>
  (ARTWORKS[cardId] ?? []).map((id) => {
    const cut = id.lastIndexOf('-');
    const setId = id.slice(0, cut);
    const localId = id.slice(cut + 1);
    const serieId = SERIES.find(([re]) => re.test(setId))?.[1];
    return { cardId: id, setId, localId, serieId, image: englishCardImageBase(serieId, setId, localId) };
  });
