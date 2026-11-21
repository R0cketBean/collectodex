// Seltenheiten aus Cardmarket-Rechnungen, dargestellt wie auf der Karte.
//
// Seit Karmesin & Purpur zeigen Karten ihre Seltenheit als Symbol unten links:
// ● Common, ◆ Uncommon, ★ Rare, ★★ Double Rare (schwarz), ★★ Ultra Rare
// (silbern), ★ / ★★ / ★★★ golden für Illustration, Special Illustration und
// Hyper Rare. Ältere Kürzel (Rare Holo, Secret, Radiant …) werden auf das
// nächstliegende Symbol abgebildet; das Label nennt die Seltenheit im Klartext.

export type RarityTone = 'plain' | 'black' | 'silver' | 'gold' | 'shiny' | 'pink';

export interface RarityInfo {
  code: string;
  /** Seltenheit im Klartext (englisch, wie im TCG gebräuchlich). */
  label: string;
  /** Symbol wie auf der Karte. */
  symbol: string;
  tone: RarityTone;
  /** Rang für Sortierung und Vergleich, höher = seltener. */
  rank: number;
}

const RARITY: Record<string, Omit<RarityInfo, 'code'>> = {
  C: { label: 'Common', symbol: '●', tone: 'plain', rank: 1 },
  U: { label: 'Uncommon', symbol: '◆', tone: 'plain', rank: 2 },
  R: { label: 'Rare', symbol: '★', tone: 'black', rank: 3 },
  RH: { label: 'Rare Holo', symbol: '★', tone: 'black', rank: 4 },
  P: { label: 'Promo', symbol: '★', tone: 'black', rank: 4 },
  PR: { label: 'Promo', symbol: '★', tone: 'black', rank: 4 },
  RR: { label: 'Double Rare', symbol: '★★', tone: 'black', rank: 5 },
  DR: { label: 'Double Rare', symbol: '★★', tone: 'black', rank: 5 },
  K: { label: 'Radiant Rare', symbol: '✦', tone: 'silver', rank: 5 },
  ACE: { label: 'ACE SPEC Rare', symbol: '★', tone: 'pink', rank: 5 },
  RRR: { label: 'Triple Rare', symbol: '★★★', tone: 'black', rank: 6 },
  UR: { label: 'Ultra Rare', symbol: '★★', tone: 'silver', rank: 6 },
  ART: { label: 'Illustration Rare', symbol: '★', tone: 'gold', rank: 7 },
  AR: { label: 'Illustration Rare', symbol: '★', tone: 'gold', rank: 7 },
  IR: { label: 'Illustration Rare', symbol: '★', tone: 'gold', rank: 7 },
  CHR: { label: 'Character Rare', symbol: '★', tone: 'gold', rank: 7 },
  S: { label: 'Shiny Rare', symbol: '★', tone: 'shiny', rank: 7 },
  SSR: { label: 'Shiny Ultra Rare', symbol: '★★', tone: 'shiny', rank: 8 },
  SR: { label: 'Secret Rare', symbol: '★★', tone: 'gold', rank: 8 },
  RS: { label: 'Secret Rare', symbol: '★★', tone: 'gold', rank: 8 },
  CSR: { label: 'Character Super Rare', symbol: '★★', tone: 'gold', rank: 8 },
  SAR: { label: 'Special Illustration Rare', symbol: '★★', tone: 'gold', rank: 9 },
  SIR: { label: 'Special Illustration Rare', symbol: '★★', tone: 'gold', rank: 9 },
  HR: { label: 'Hyper Rare', symbol: '★★★', tone: 'gold', rank: 10 },
  MUR: { label: 'Mega Ultra Rare', symbol: '★★★', tone: 'gold', rank: 10 },
  BWR: { label: 'Black White Rare', symbol: '★★★', tone: 'gold', rank: 10 },
};

/** Seltenheit zum Cardmarket-Kürzel; unbekannte Kürzel bleiben als Text stehen. */
export const rarityInfo = (code: string | undefined): RarityInfo | null => {
  if (!code) return null;
  const known = RARITY[code.toUpperCase()];
  return known ? { code, ...known } : { code, label: code, symbol: '', tone: 'plain', rank: 0 };
};

/** Tailwind-Klassen je Farbton des Symbols. */
export const RARITY_TONE_CLASS: Record<RarityTone, string> = {
  plain: 'text-gray-500 dark:text-gray-400',
  black: 'text-gray-900 dark:text-gray-100',
  silver: 'text-slate-400 dark:text-slate-300',
  gold: 'text-amber-500 dark:text-amber-400',
  shiny: 'text-amber-400 dark:text-amber-300 drop-shadow-[0_0_2px_rgba(251,191,36,0.8)]',
  pink: 'text-pink-500 dark:text-pink-400',
};
