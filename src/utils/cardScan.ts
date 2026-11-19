// Kartenscanner (#168): wertet die Textzeilen der Texterkennung aus und
// bewertet Katalogkarten danach, wie gut sie dazu passen.
//
// Was auf einer Karte zuverlässig lesbar ist:
// - unten links die Nummer mit gedruckter Gesamtzahl („123/198“, „TG05/TG30“),
// - seit Karmesin & Purpur davor Set-Code und Sprache („SVI DE“),
// - oben der Kartenname.
// Die Gesamtzahl entspricht der offiziellen Kartenzahl des Sets bei TCGdex
// (Secret Rares tragen eine höhere Nummer, aber dieselbe Gesamtzahl). Damit
// bleiben meist nur ein bis drei Sets übrig; der Name entscheidet den Rest.
//
// Bewusst ohne Electron- und Netzwerkabhängigkeit, damit das Modul später
// auch in einer mobilen App laufen kann (#173).

import type { OcrLine } from '../types/electron';
import { normalizeName } from './catalogMatch';
import { IMAGE_MATCH_MAX, imageMatches } from './imageFingerprint';

export interface ScanInfo {
  /** Set-Code wie „SVI“, „MEW“, „PAF“ (nur Karten ab Karmesin & Purpur). */
  setCode?: string;
  /** Sprachkürzel neben dem Set-Code („DE“). */
  lang?: string;
  /** Kartennummer, wie gedruckt, ohne führende Nullen („123“, „TG5“). */
  number?: string;
  /** Gedruckte Gesamtzahl ohne Präfix („198“, „30“ bei „TG30“). */
  total?: number;
  /** Vermuteter Kartenname. */
  name?: string;
}

// Wörter oben auf der Karte, die kein Name sind (Entwicklungsstufe, Kartentyp).
const HEADER_WORDS =
  /^(basis|phase\s*[12ilzj]?|stufe\s*[12]|vstar|vmax|v-union|trainer|item|unterstützer|unterstutzer|stadion|ausrüstung|ausrustung|energie|basis-energie|spezial-energie|pokémon-ausrüstung|kp\b.*|hp\b.*|terakristall|entwickelt sich.*)$/i;

// Häufige Lesefehler in Ziffernfolgen.
const DIGIT_FIXES: Record<string, string> = { O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', '|': '1', S: '5', B: '8' };
const fixDigits = (s: string) => s.replace(/[OoDQIl|SB]/g, (c) => DIGIT_FIXES[c] ?? c);

const stripZeros = (s: string) => s.replace(/^0+(?=\d)/, '');

/** Nummer vereinheitlichen: Großbuchstaben, ohne führende Nullen im Zahlenteil („tg05“ → „TG5“). */
export const normalizeCardNumber = (value: string) => {
  const m = /^([A-Za-z]*)(\d+)([A-Za-z]?)$/.exec(value.trim());
  if (!m) return value.trim().toUpperCase();
  return `${m[1].toUpperCase()}${stripZeros(m[2])}${m[3].toLowerCase()}`;
};

/** Ob die Katalognummer (localId) zur gelesenen Nummer passt. */
export const localIdMatches = (localId: string, number: string | undefined) =>
  Boolean(number) && normalizeCardNumber(localId) === normalizeCardNumber(number ?? '');

// „123/198“, „TG05/TG30“, „SV049/SV122“, „GG01/GG70“; die Gesamtzahl hat
// mindestens zwei Stellen. Buchstaben, die Ziffern sein müssten, werden repariert.
const NUMBER_TOTAL = /(?:^|[^A-Za-z0-9])([A-Z]{0,3})([0-9OoIlDSB]{1,3})\s*\/\s*([A-Z]{0,3})([0-9OoIlDSB]{2,3})(?![0-9])/;
// Set-Code und Sprache: „SVI DE“, „MEW DE“, „SV3a DE“ – mind. zwei Buchstaben.
const SET_CODE = /(?:^|[^A-Za-z0-9])([A-Z][A-Z0-9]{1,3}[a-z]?)\s+(DE|EN|FR|IT|ES|PT|NL)(?![A-Za-z])/;
// Promo ohne Gesamtzahl: „SVP DE 045“.
const PROMO = /(?:^|[^A-Za-z0-9])([A-Z]{2,4})\s+(DE|EN|FR|IT|ES|PT|NL)\s+([0-9OoIl]{1,3})(?![0-9/])/;

// Stufe vor dem Namen in derselben Zeile: „PHASEz Glurak“.
const LEADING_STAGE = /^(basis|phase\s*[12ilzj]?|stufe\s*[12])\s+/i;
// Kraftpunkte hinter dem Namen oder als eigene Zeile: „Glurak 120 KP“, „40 HP 4“, „HP 90“.
const HIT_POINTS = /\s*(\d{2,3}\s*(HP|KP)|(HP|KP)\s*\d{2,3}).*$/i;
// Level-Angabe der Diamant-&-Perl-Ära: „Dialga LV.68“ (aber „LV.X“ gehört zum Namen).
const LEVEL = /\s*LV\.?\s*\d+\b.*$/i;

const bottomLines = (lines: OcrLine[]) =>
  lines
    .filter((l) => l.y >= 0.85)
    // Der vergrößerte Durchgang liest den kleinen Code meist besser.
    .sort((a, b) => (a.pass === b.pass ? b.confidence - a.confidence : a.pass === 'bottom' ? -1 : 1));

const pickName = (lines: OcrLine[]): string | undefined => {
  const candidates = lines
    // Mit Hülle oder leicht schräg liegt der Name etwas tiefer als 0,12.
    .filter((l) => l.pass === 'full' && l.y < 0.17 && l.x > 0.04 && l.x < 0.65)
    .map((l) => ({
      ...l,
      text: l.text.replace(/\s+/g, ' ').trim().replace(LEADING_STAGE, '').replace(HIT_POINTS, '').replace(LEVEL, ''),
    }))
    .filter((l) => l.text.length >= 2 && !HEADER_WORDS.test(l.text) && /[A-Za-zÄÖÜäöüß]{2}/.test(l.text));
  // Der Name ist die oberste, größte Zeile in diesem Bereich.
  candidates.sort((a, b) => b.h - a.h || a.y - b.y);
  return candidates[0]?.text;
};

/**
 * Koordinaten auf den Bereich beziehen, den der Text einnimmt. Wurde die Karte
 * im Foto nicht gefunden (z. B. in der Hand), gelten die Angaben sonst für das
 * ganze Foto, und Name und Nummer liegen nicht dort, wo sie gesucht werden.
 */
const relativeToText = (lines: OcrLine[]): OcrLine[] => {
  const full = lines.filter((l) => l.pass === 'full');
  if (full.length === 0) return lines;
  const x0 = Math.min(...full.map((l) => l.x));
  const y0 = Math.min(...full.map((l) => l.y));
  const x1 = Math.max(...full.map((l) => l.x + l.w));
  const y1 = Math.max(...full.map((l) => l.y + l.h));
  const w = Math.max(x1 - x0, 0.01);
  const h = Math.max(y1 - y0, 0.01);
  // Der Text endet knapp über dem Kartenrand; die Fußzeile soll im unteren Bereich landen.
  return full.map((l) => ({ ...l, x: (l.x - x0) / w, y: Math.min(1, (l.y - y0) / h + 0.04), w: l.w / w, h: l.h / h }));
};

/** Liest Set-Code, Nummer, Gesamtzahl und Name aus den erkannten Zeilen. */
export const parseScan = (lines: OcrLine[]): ScanInfo => {
  const info = parseLines(lines);
  if (info.number || info.setCode) return info;
  // Unten nichts gefunden: Karte wurde wohl nicht erkannt – am Text ausrichten.
  const fallback = parseLines(relativeToText(lines));
  return fallback.number || fallback.setCode ? fallback : info;
};

const parseLines = (lines: OcrLine[]): ScanInfo => {
  const info: ScanInfo = {};
  const bottom = bottomLines(lines);

  for (const line of bottom) {
    const text = line.text;
    if (!info.number) {
      const m = NUMBER_TOTAL.exec(text);
      if (m) {
        // Echte Präfixe stehen auf beiden Seiten („TG05/TG30“). Steht nur vorn
        // etwas, ist es meist eine verlesene Ziffer („O50/167“).
        const prefix = m[3] ? m[1] : '';
        const digits = m[3] ? m[2] : /^[OoIlDSB]*$/.test(m[1]) ? m[1] + m[2] : m[2];
        info.number = normalizeCardNumber(`${prefix}${fixDigits(digits)}`);
        info.total = Number(stripZeros(fixDigits(m[4])));
      }
    }
    if (!info.setCode) {
      const m = SET_CODE.exec(text);
      if (m) {
        info.setCode = m[1].toUpperCase();
        info.lang = m[2];
      }
    }
  }

  if (!info.number) {
    for (const line of bottom) {
      const m = PROMO.exec(line.text);
      if (m) {
        info.setCode ??= m[1].toUpperCase();
        info.lang ??= m[2];
        info.number = normalizeCardNumber(fixDigits(m[3]));
        break;
      }
    }
  }

  // Promo, bei der die Nummer als eigene Zeile neben dem Code steht: „MEP DE“ | „116“.
  if (!info.number && info.setCode) {
    const codeLine = bottom.find((l) => SET_CODE.test(l.text));
    const lone = codeLine
      ? bottom.find(
          (l) =>
            l.pass === codeLine.pass &&
            l.x > codeLine.x &&
            Math.abs(l.y - codeLine.y) < 0.02 &&
            /^[0-9OoIl]{1,3}$/.test(l.text.trim())
        )
      : undefined;
    if (lone) info.number = normalizeCardNumber(fixDigits(lone.text.trim()));
  }

  const name = pickName(lines);
  if (name) info.name = name;
  return info;
};

// --- Namensvergleich -------------------------------------------------------

const levenshtein = (a: string, b: string) => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
};

/**
 * Ähnlichkeit zweier Kartennamen von 0 bis 1. Lesefehler wie „GlurakeX“ für
 * „Glurak-ex“ oder „Lugia / STAR“ für „Lugia-VSTAR“ sollen hoch bewertet werden.
 */
export const nameSimilarity = (read: string | undefined, catalog: string) => {
  const a = normalizeName(read ?? '');
  const b = normalizeName(catalog);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))) return 0.85;
  return Math.max(0, 1 - levenshtein(a, b) / Math.max(a.length, b.length));
};

// --- Bewertung -------------------------------------------------------------

export interface ScanCandidate {
  cardId: string;
  setId: string;
  setName: string;
  localId: string;
  name: string;
  image?: string;
  /** Offizielle Kartenzahl des Sets. */
  official?: number;
  /** Set-Code des Sets, falls bekannt. */
  setCode?: string;
  /** Serie des Sets (für das englische Bild beim Bildvergleich). */
  serieId?: string;
}

export interface RankedCandidate extends ScanCandidate {
  score: number;
  /** Welche Hinweise übereinstimmen – für die Anzeige. */
  matches: Array<'code' | 'number' | 'total' | 'name' | 'image'>;
}

/**
 * Bewertet Kandidaten; der beste zuerst. Kandidaten ohne jede Übereinstimmung fallen weg.
 * `distances`: Ergebnis des Bildvergleichs (#170) je Karten-ID, falls gelaufen.
 */
export const rankCandidates = (
  candidates: ScanCandidate[],
  info: ScanInfo,
  distances?: Map<string, number | null>
): RankedCandidate[] => {
  const pictured = distances ? imageMatches(distances) : new Set<string>();
  const ranked = candidates.map((c) => {
    const matches: RankedCandidate['matches'] = [];
    let score = 0;
    if (info.setCode && c.setCode && info.setCode === c.setCode.toUpperCase()) {
      matches.push('code');
      score += 3;
    }
    if (localIdMatches(c.localId, info.number)) {
      matches.push('number');
      score += 3;
    }
    if (info.total !== undefined && c.official === info.total) {
      matches.push('total');
      score += 2;
    }
    const similarity = nameSimilarity(info.name, c.name);
    if (similarity >= 0.6) {
      matches.push('name');
      score += 3 * similarity;
    }
    if (pictured.has(c.cardId)) {
      matches.push('image');
      // Je näher, desto mehr: 3 bis 4 Punkte.
      score += 3 + (1 - (distances?.get(c.cardId) ?? IMAGE_MATCH_MAX) / IMAGE_MATCH_MAX);
    }
    return { ...c, score, matches };
  });
  const seen = new Set<string>();
  return ranked
    .filter((c) => c.matches.length > 0)
    .sort((a, b) => b.score - a.score || a.cardId.localeCompare(b.cardId))
    .filter((c) => !seen.has(c.cardId) && Boolean(seen.add(c.cardId)));
};

/** Gilt der beste Treffer als sicher? Zwei unabhängige Hinweise und deutlicher Abstand zum zweiten. */
export const isConfident = (ranked: RankedCandidate[]) => {
  const [first, second] = ranked;
  if (!first) return false;
  const has = (m: RankedCandidate['matches'][number]) => first.matches.includes(m);
  const strong = has('number') && (has('code') || has('total'));
  // Code, Nummer und Gesamtzahl zusammen sind eindeutig – auch wenn der Name
  // (z. B. auf Holo-Karten) nicht lesbar war. Das Bild ersetzt den Namen.
  const agrees = strong && (has('name') || has('image') || (has('code') && has('total')));
  // Ältere Karten ohne lesbare Nummer: Name und Artwork stimmen überein.
  const pictured = has('image') && has('name');
  return (agrees || pictured) && (!second || first.score - second.score >= 2);
};
