// Kartenscanner (#180): Zuordnung japanischer Vintage-Karten zu den
// englischen Karten mit demselben Artwork.
//
// Japanische Karten von Grundset bis e-Serie tragen keine Kartennummer, und
// TCGdex hat für diese Sets keine Bilder. Die Artworks sind aber fast immer
// dieselben wie in den englischen Sets. Dieses Skript ordnet jede japanische
// Pokémon-Karte den englischen Karten desselben Pokémon im entsprechenden Set
// zu (Pokédex-Nummer, bei mehreren Treffern zusätzlich KP und Typ) und
// schreibt die Tabelle nach src/data/jpVintageArtwork.json. Der Scanner
// vergleicht dann mit den englischen Bildern.
//
// Trainer- und Energiekarten bleiben außen vor: Ihre Namen lassen sich nicht
// zuordnen, und Basis-Energien sehen in allen Sets gleich aus.
//
// Aufruf (einmalig, ändert sich nur mit neuen Daten bei TCGdex):
//   node scripts/build-jp-vintage-artwork.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.tcgdex.net/v2';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'jpVintageArtwork.json');

// Japanisches Set → englische Sets mit denselben Artworks. Die japanischen
// Gym- und e-Sets wurden auf Englisch anders zusammengestellt; deshalb
// mehrere Ziele. VS und web gibt es auf Englisch nicht.
const SETS = {
  PMCG1: ['base1'],
  PMCG2: ['base2'],
  PMCG3: ['base3'],
  PMCG4: ['base5'],
  PMCG5: ['gym1', 'gym2'],
  PMCG6: ['gym1', 'gym2'],
  neo1: ['neo1'],
  neo2: ['neo2'],
  neo3: ['neo3'],
  neo4: ['neo4'],
  E1: ['ecard1'],
  E2: ['ecard1', 'ecard2'],
  E3: ['ecard2', 'ecard3'],
  E4: ['ecard2', 'ecard3'],
  E5: ['ecard3'],
};

const get = async (url, tries = 4) => {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (error) {
      if (i + 1 >= tries) throw error;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
};

const mapLimit = async (items, limit, fn) => {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
};

/** Pokémon-Karten eines Sets mit Pokédex-Nummer, KP und Typ. */
const pokemonOf = async (lang, setId) => {
  const set = await get(`${API}/${lang}/sets/${encodeURIComponent(setId)}`);
  const details = await mapLimit(set.cards ?? [], 8, (c) => get(`${API}/${lang}/cards/${encodeURIComponent(c.id)}`));
  return details
    .filter((d) => d.category === 'Pokemon' && Array.isArray(d.dexId) && d.dexId.length > 0)
    .map((d) => ({ id: d.id, dexId: d.dexId[0], hp: d.hp ?? null, types: (d.types ?? []).join('/') }));
};

const english = new Map();
const englishSet = (id) => {
  if (!english.has(id)) english.set(id, pokemonOf('en', id));
  return english.get(id);
};

const table = {};
let unmatched = 0;
for (const [jpSet, enSets] of Object.entries(SETS)) {
  const [jp, ...targets] = await Promise.all([pokemonOf('ja', jpSet), ...enSets.map(englishSet)]);
  const pool = targets.flat();
  let matched = 0;
  for (const card of jp) {
    const same = pool.filter((e) => e.dexId === card.dexId);
    // Mehrere Karten desselben Pokémon: KP und Typ grenzen ein, sofern sie passen.
    const exact = same.filter((e) => e.hp === card.hp && e.types === card.types);
    const byHp = same.filter((e) => e.hp === card.hp);
    const pick = exact.length > 0 ? exact : byHp.length > 0 ? byHp : same;
    if (pick.length === 0) {
      unmatched++;
      continue;
    }
    table[card.id] = pick.map((e) => e.id).sort();
    matched++;
  }
  console.log(`${jpSet}: ${matched}/${jp.length} Pokémon zugeordnet (→ ${enSets.join(', ')})`);
}

const sorted = Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })));
fs.writeFileSync(OUT, `${JSON.stringify(sorted, null, 0).replace(/\],"/g, '],\n"').replace(/^\{/, '{\n')}\n`);
console.log(`\n${Object.keys(sorted).length} Karten in ${path.relative(process.cwd(), OUT)}, ${unmatched} ohne Gegenstück`);
