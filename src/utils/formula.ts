/**
 * Auswertung von benutzerdefinierten Formeln auf Attribut-Werten.
 *
 * Beispiel:
 *   evaluateFormula('quantity * purchasePrice',
 *                   { quantity: 5, purchasePrice: 10 })
 *   ===> 50
 *
 * SICHERHEITS-HINWEIS
 * Diese Implementierung benutzt `eval()` auf einem String, der aus
 * einer benutzerdefinierten Formel und benutzerdefinierten Werten
 * zusammengesetzt wird. Da Formeln im Code-Pfad ausschließlich vom
 * Anwender selbst eingegeben werden (CategoryManagement) und die App
 * keine fremden Daten lädt, ist das Risiko begrenzt — trotzdem ist
 * `eval` strukturell unsicher und steht auf der Phase-3-Liste als
 * Kandidat für einen kleinen Expression-Parser.
 */
export const evaluateFormula = (
  formula: string,
  values: { [key: string]: unknown }
): unknown => {
  try {
    // Längste Attribut-Namen zuerst ersetzen, damit eine Variable wie
    // `purchasePrice` nicht von einem späteren `Price`-Pattern teilweise
    // konsumiert wird.
    const sortedKeys = Object.keys(values).sort((a, b) => b.length - a.length);

    let evaluationString = formula;
    for (const key of sortedKeys) {
      const regex = new RegExp(`\\b${escapeRegex(key)}\\b`, 'g');
      const value = values[key];

      if (typeof value === 'number') {
        evaluationString = evaluationString.replace(regex, value.toString());
      } else if (typeof value === 'string') {
        evaluationString = evaluationString.replace(regex, `"${value}"`);
      } else if (value === null || value === undefined) {
        evaluationString = evaluationString.replace(regex, '0');
      } else {
        evaluationString = evaluationString.replace(
          regex,
          JSON.stringify(value)
        );
      }
    }

    // eslint-disable-next-line no-eval
    return eval(evaluationString);
  } catch (error) {
    console.error('Fehler bei der Formelberechnung:', error);
    return null;
  }
};

const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
