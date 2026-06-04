/**
 * Auswertung von benutzerdefinierten Formeln auf Attribut-Werten.
 *
 * Beispiel:
 *   evaluateFormula('quantity * purchasePrice',
 *                   { quantity: 5, purchasePrice: 10 })
 *   ===> 50
 *
 * Implementiert als kleiner Tokenizer + Recursive-Descent-Parser, der
 * nur die unterstützten Operationen (+ - * /, Klammern, Zahlen,
 * String-Literale, Attribut-Variablen) kennt. Damit kommt die App ohne
 * `eval` aus — frühere Versionen setzten die Werte als String ein und
 * werteten ihn per eval aus, was strukturell unsicher war und die
 * Minification behinderte (#16).
 *
 * Semantik orientiert sich an JavaScript:
 * - `+` konkateniert, sobald ein Operand ein String ist, sonst addiert
 *   es numerisch (so funktioniert `name + " Special"`).
 * - `- * /` rechnen numerisch.
 * - Ein Attribut mit Wert null/undefined zählt als 0.
 * - Ein in der Formel referenziertes, aber nicht vorhandenes Attribut
 *   ist ein Fehler (analog zum früheren ReferenceError).
 *
 * Bei jedem Fehler (Syntax, unbekannte Variable) wird `null`
 * zurückgegeben und der Fehler protokolliert.
 */
export const evaluateFormula = (
  formula: string,
  values: { [key: string]: unknown }
): unknown => {
  try {
    const tokens = tokenize(formula);
    const parser = new Parser(tokens, values);
    const result = parser.parseExpression();
    parser.expectEnd();
    return result;
  } catch (error) {
    console.error('Fehler bei der Formelberechnung:', error);
    return null;
  }
};

type Token =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: '+' | '-' | '*' | '/' | '(' | ')' };

const tokenize = (input: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    // Whitespace überspringen
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Operatoren und Klammern
    if (char === '+' || char === '-' || char === '*' || char === '/' || char === '(' || char === ')') {
      tokens.push({ type: 'op', value: char });
      i++;
      continue;
    }

    // String-Literal in doppelten Anführungszeichen
    if (char === '"') {
      let value = '';
      i++; // öffnendes Anführungszeichen
      while (i < input.length && input[i] !== '"') {
        // Einfaches Escaping für \" und \\
        if (input[i] === '\\' && i + 1 < input.length) {
          value += input[i + 1];
          i += 2;
        } else {
          value += input[i];
          i++;
        }
      }
      if (i >= input.length) {
        throw new Error('Nicht abgeschlossenes String-Literal in der Formel');
      }
      i++; // schließendes Anführungszeichen
      tokens.push({ type: 'string', value });
      continue;
    }

    // Zahl (Ganzzahl oder Dezimal mit Punkt)
    if (/[0-9.]/.test(char)) {
      let raw = '';
      while (i < input.length && /[0-9.]/.test(input[i])) {
        raw += input[i];
        i++;
      }
      const num = Number(raw);
      if (Number.isNaN(num)) {
        throw new Error(`Ungültige Zahl in der Formel: "${raw}"`);
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }

    // Bezeichner (Attributname): Buchstabe/_ gefolgt von Wortzeichen
    if (/[A-Za-z_]/.test(char)) {
      let name = '';
      while (i < input.length && /[A-Za-z0-9_]/.test(input[i])) {
        name += input[i];
        i++;
      }
      tokens.push({ type: 'ident', value: name });
      continue;
    }

    throw new Error(`Unerwartetes Zeichen in der Formel: "${char}"`);
  }

  return tokens;
};

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly values: { [key: string]: unknown }
  ) {}

  /** expression := term (('+' | '-') term)* */
  parseExpression(): unknown {
    let left = this.parseTerm();

    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.next() as { value: string }).value;
      const right = this.parseTerm();
      left = op === '+' ? add(left, right) : toNumber(left) - toNumber(right);
    }

    return left;
  }

  /** term := factor (('*' | '/') factor)* */
  private parseTerm(): unknown {
    let left = this.parseFactor();

    while (this.isOp('*') || this.isOp('/')) {
      const op = (this.next() as { value: string }).value;
      const right = this.parseFactor();
      left =
        op === '*'
          ? toNumber(left) * toNumber(right)
          : toNumber(left) / toNumber(right);
    }

    return left;
  }

  /** factor := number | string | ident | '(' expression ')' | '-' factor */
  private parseFactor(): unknown {
    const token = this.tokens[this.pos];

    if (!token) {
      throw new Error('Unerwartetes Ende der Formel');
    }

    // Unäres Minus
    if (token.type === 'op' && token.value === '-') {
      this.pos++;
      return -toNumber(this.parseFactor());
    }

    if (token.type === 'number') {
      this.pos++;
      return token.value;
    }

    if (token.type === 'string') {
      this.pos++;
      return token.value;
    }

    if (token.type === 'ident') {
      this.pos++;
      return this.resolveIdentifier(token.value);
    }

    if (token.type === 'op' && token.value === '(') {
      this.pos++;
      const value = this.parseExpression();
      const closing = this.tokens[this.pos];
      if (!closing || closing.type !== 'op' || closing.value !== ')') {
        throw new Error('Fehlende schließende Klammer in der Formel');
      }
      this.pos++;
      return value;
    }

    throw new Error(`Unerwartetes Token in der Formel: "${token.value}"`);
  }

  private resolveIdentifier(name: string): unknown {
    if (!(name in this.values)) {
      throw new Error(`Unbekanntes Attribut in der Formel: "${name}"`);
    }
    const value = this.values[name];
    if (value === null || value === undefined) {
      return 0;
    }
    return value;
  }

  expectEnd(): void {
    if (this.pos < this.tokens.length) {
      const token = this.tokens[this.pos];
      throw new Error(`Unerwartetes Token am Formelende: "${token.value}"`);
    }
  }

  private isOp(op: string): boolean {
    const token = this.tokens[this.pos];
    return !!token && token.type === 'op' && token.value === op;
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }
}

/**
 * `+`: String-Konkatenation, sobald ein Operand ein String ist —
 * andernfalls numerische Addition (entspricht der JavaScript-Semantik,
 * an die die bestehenden Formeln gewöhnt sind).
 */
const add = (a: unknown, b: unknown): unknown => {
  if (typeof a === 'string' || typeof b === 'string') {
    return stringify(a) + stringify(b);
  }
  return toNumber(a) + toNumber(b);
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
};

const stringify = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};
