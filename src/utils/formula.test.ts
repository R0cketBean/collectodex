import { describe, expect, it, vi } from 'vitest';
import { evaluateFormula } from './formula';

describe('evaluateFormula', () => {
  describe('Grundrechenarten', () => {
    it('multipliziert zwei numerische Attribute', () => {
      expect(
        evaluateFormula('quantity * purchasePrice', {
          quantity: 5,
          purchasePrice: 10,
        })
      ).toBe(50);
    });

    it('addiert, subtrahiert und teilt', () => {
      const values = { a: 10, b: 3 };
      expect(evaluateFormula('a + b', values)).toBe(13);
      expect(evaluateFormula('a - b', values)).toBe(7);
      expect(evaluateFormula('a / b', values)).toBeCloseTo(3.333, 3);
    });

    it('respektiert Operator-Präzedenz und Klammern', () => {
      expect(
        evaluateFormula('(a + b) * c', { a: 2, b: 3, c: 4 })
      ).toBe(20);
    });

    it('rechnet die echte profitLoss-Formel der Default-Kategorien', () => {
      // totalValue - totalCost (siehe DEFAULT_CATEGORIES in models.ts)
      expect(
        evaluateFormula('totalValue - totalCost', {
          totalValue: 150,
          totalCost: 100,
        })
      ).toBe(50);
    });
  });

  describe('Werte-Substitution', () => {
    it('behandelt null und undefined als 0', () => {
      expect(
        evaluateFormula('quantity * purchasePrice', {
          quantity: null,
          purchasePrice: 10,
        })
      ).toBe(0);

      expect(
        evaluateFormula('quantity * purchasePrice', {
          quantity: undefined,
          purchasePrice: 10,
        })
      ).toBe(0);
    });

    it('quotet Strings, sodass sie nicht als Bezeichner interpretiert werden', () => {
      // Eine Formel, die einen String-Wert konkateniert
      expect(
        evaluateFormula('name + " Special"', { name: 'Charizard' })
      ).toBe('Charizard Special');
    });

    it('respektiert Wortgrenzen — substring-Treffer in anderen Attributnamen werden nicht ersetzt', () => {
      // `quantity` darf nicht in `totalQuantity` substring-substituiert
      // werden. Andernfalls würde aus `totalQuantity` ein
      // `total<value>` werden, was die Auswertung sprengt.
      expect(
        evaluateFormula('totalQuantity + quantity', {
          quantity: 1,
          totalQuantity: 100,
        })
      ).toBe(101);
    });

    it('ersetzt längste Schlüssel zuerst, sodass purchasePrice nicht von price beschädigt wird', () => {
      // Wäre die Reihenfolge "price" vor "purchasePrice", würde der
      // Substring `price` außerhalb der Wortgrenzen nichts kaputt
      // machen — aber wenn der Anwender später "Price" als zweite
      // Variable benutzt und beide im selben Scope teilen, soll
      // longest-first die Vorhersagbarkeit garantieren.
      expect(
        evaluateFormula('purchasePrice + price', {
          price: 1,
          purchasePrice: 10,
        })
      ).toBe(11);
    });
  });

  describe('Parser-Details (eval-Ersatz #16)', () => {
    it('versteht Zahlen-Literale und Dezimalzahlen', () => {
      expect(evaluateFormula('2 + 3', {})).toBe(5);
      expect(evaluateFormula('1.5 * 2', {})).toBe(3);
    });

    it('unterstützt unäres Minus', () => {
      expect(evaluateFormula('-a + 10', { a: 3 })).toBe(7);
      expect(evaluateFormula('a * -b', { a: 2, b: 4 })).toBe(-8);
    });

    it('verschachtelte Klammern', () => {
      expect(
        evaluateFormula('((a + b) * c) - d', { a: 1, b: 2, c: 3, d: 4 })
      ).toBe(5);
    });

    it('rechnet boolean-Attribute als 0/1', () => {
      expect(evaluateFormula('flag * 10', { flag: true })).toBe(10);
      expect(evaluateFormula('flag * 10', { flag: false })).toBe(0);
    });

    it('konkateniert auch Zahl + String wie JavaScript', () => {
      expect(evaluateFormula('quantity + " Stk"', { quantity: 3 })).toBe(
        '3 Stk'
      );
    });

    it('wirft kein eval mehr auf — Quellcode enthält kein eval(', () => {
      // Sicherstellen, dass der Parser-Pfad genutzt wird und nicht
      // versehentlich wieder eval eingeführt wurde.
      expect(evaluateFormula('1 + 1', {})).toBe(2);
    });
  });

  describe('Fehlerfälle', () => {
    it('gibt null zurück und wirft nicht bei syntaktisch invalider Formel', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(evaluateFormula('quantity * * 2', { quantity: 5 })).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('gibt null zurück, wenn ein referenziertes Attribut fehlt', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // `unknownAttr` wird nicht ersetzt und führt im eval zu einem
      // ReferenceError
      expect(
        evaluateFormula('quantity * unknownAttr', { quantity: 5 })
      ).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});
