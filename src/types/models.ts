// Basisdatentypen für die flexible Sammlungsverwaltung

// Verfügbare Datentypen für Attribute
export type AttributeDataType = 'text' | 'number' | 'boolean' | 'date' | 'dropdown' | 'formula' | 'image' | 'link';

// Definition eines Attributs
export interface AttributeDefinition {
  id: string;
  name: string;
  type: AttributeDataType;
  required: boolean;
  isCore?: boolean;      // Ist es ein Kernattribut, das nicht gelöscht werden kann?
  isVisible?: boolean;   // Soll es in Listen angezeigt werden?
  options?: string[];    // Für Dropdown-Attribute
  isCalculated?: boolean;
  formula?: string;      // Für berechnete Felder
  order: number;         // Reihenfolge im UI
}

// Kategorie-Definition (z.B. "Sealed Produkte", "Einzelkarten")
export interface Category {
  id: string;
  name: string;
  description?: string;
  icon?: string;         // Icon-Name für die Anzeige
  attributes: AttributeDefinition[];
  order: number;         // Reihenfolge im UI
  isDefault?: boolean;   // Ist es eine Standardkategorie?
  hidden?: boolean;      // Aus der Navigation ausgeblendet (Werte zählen weiter)
  color?: string;        // Frei gewählte Farb-Klasse (Fallback: nach order)
  createdAt: Date;
  updatedAt: Date;
}

// Ein generischer Sammlungseintrag
export interface CollectionItem {
  id: string;
  categoryId: string;
  values: {
    [attributeId: string]: any; // Werte für jedes Attribut
  };
  images?: {
    [attributeId: string]: string; // Base64-kodierte Bilder oder URLs
  };
  links?: {
    [attributeId: string]: string; // URLs für Hyperlinks
  };
  createdAt: Date;
  updatedAt: Date;
}

// Zusammenfassung der Sammlung für das Dashboard
export interface CollectionSummary {
  totalItems: number;
  totalValue: number;
  totalCost: number;
  profitLoss: number;
  categorySummaries: {
    [categoryId: string]: {
      name: string;
      count: number;
      value: number;
      cost: number;
      profitLoss: number;
    }
  };
}

// Ein täglicher Wert-Snapshot für die echte Wertentwicklung (#26).
// date als 'YYYY-MM-DD' (Tagesgranularität); pro Kategorie zusätzlich, um
// später kategorieweise Verläufe darstellen zu können.
export interface ValueSnapshot {
  date: string;
  totalValue: number;
  totalCost: number;
  categories: {
    [categoryId: string]: { value: number; cost: number };
  };
}

// Standard-Attribute, die in jeder Kategorie existieren sollten
export const CORE_ATTRIBUTES: AttributeDefinition[] = [
  {
    id: 'name',
    name: 'Name',
    type: 'text',
    required: true,
    isCore: true,
    isVisible: true,
    order: 0
  },
  {
    id: 'quantity',
    name: 'Anzahl',
    type: 'number',
    required: true,
    isCore: true,
    isVisible: true,
    order: 1
  },
  {
    id: 'purchasePrice',
    name: 'Kaufpreis',
    type: 'number',
    required: true,
    isCore: true,
    isVisible: true,
    order: 2
  },
  {
    id: 'currentValue',
    name: 'Aktueller Wert',
    type: 'number',
    required: true,
    isCore: true,
    isVisible: true,
    order: 3
  },
  {
    id: 'totalCost',
    name: 'Gesamtkosten',
    type: 'formula',
    required: true,
    isCore: true,
    isVisible: true,
    isCalculated: true,
    formula: 'quantity * purchasePrice',
    order: 4
  },
  {
    id: 'totalValue',
    name: 'Gesamtwert',
    type: 'formula',
    required: true,
    isCore: true,
    isVisible: true,
    isCalculated: true,
    formula: 'quantity * currentValue',
    order: 5
  },
  {
    id: 'profitLoss',
    name: 'Gewinn/Verlust',
    type: 'formula',
    required: true,
    isCore: true,
    isVisible: true,
    isCalculated: true,
    formula: 'totalValue - totalCost',
    order: 6
  },
  {
    // Sichtbares, editierbares Kaufdatum des Artikels (#45). Wird beim Anlegen
    // automatisch mit dem heutigen Datum vorbelegt. Die ID bleibt aus
    // Kompatibilitätsgründen 'addedDate' (gespeicherte Werte hängen daran),
    // der angezeigte Name ist aber "Gekauft am".
    id: 'addedDate',
    name: 'Gekauft am',
    type: 'date',
    required: false,
    isCore: true,
    isVisible: true,
    order: 7
  }
];

// Vordefinierte Attribute für "Sealed Produkte"
export const SEALED_ATTRIBUTES: AttributeDefinition[] = [
  ...CORE_ATTRIBUTES,
  {
    id: 'category',
    name: 'Kategorie',
    type: 'dropdown',
    required: false,
    isVisible: true,
    options: [
      'Booster', 
      'Blister', 
      'Display', 
      'Elite Trainer Box', 
      'Box Sets', 
      'Tin Box', 
      'Mini Tin Box',
      'Theme Deck',
      'Deck',
      'V Box',
      'V Collection',
      'V Premium Collection',
      'Collector Box',
      'Collector Chest',
      'Bundle Box',
      'Special Set',
      'Premium Box',
      'Promo Box'
    ],
    order: 7
  },
  {
    id: 'language',
    name: 'Sprache',
    type: 'dropdown',
    required: false,
    isVisible: true,
    options: ['deutsch', 'englisch', 'japanisch', 'französisch', 'italienisch', 'spanisch'],
    order: 8
  }
];

// Vordefinierte Standardkategorien
export const DEFAULT_CATEGORIES: Omit<Category, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'sealed',
    name: 'Sealed Produkte',
    description: 'Ungeöffnete Produkte wie Booster, ETBs, etc.',
    icon: 'archive',
    attributes: SEALED_ATTRIBUTES,
    order: 0,
    isDefault: true
  },
  {
    id: 'graded',
    name: 'Gegradete Karten',
    description: 'Karten, die professionell bewertet wurden',
    icon: 'star',
    attributes: [
      ...CORE_ATTRIBUTES,
      {
        id: 'expansion',
        name: 'Erweiterung',
        type: 'text',
        required: false,
        isVisible: true,
        order: 7
      },
      {
        id: 'condition',
        name: 'Zustand',
        type: 'text',
        required: false,
        isVisible: true,
        order: 8
      },
      {
        id: 'grade',
        name: 'Grade',
        type: 'text',
        required: false,
        isVisible: true,
        order: 9
      },
      {
        id: 'gradingService',
        name: 'Grading Service',
        type: 'dropdown',
        required: false,
        isVisible: true,
        options: ['PSA', 'BGS', 'CGC', 'SGC'],
        order: 10
      },
      {
        id: 'language',
        name: 'Sprache',
        type: 'dropdown',
        required: false,
        isVisible: true,
        options: ['deutsch', 'englisch', 'japanisch', 'französisch', 'italienisch', 'spanisch'],
        order: 11
      }
    ],
    order: 1,
    isDefault: true
  },
  {
    id: 'singles',
    name: 'Einzelkarten',
    description: 'Lose Karten in deiner Sammlung',
    icon: 'collection',
    attributes: [
      ...CORE_ATTRIBUTES,
      {
        id: 'expansion',
        name: 'Erweiterung',
        type: 'text',
        required: false,
        isVisible: true,
        order: 7
      },
      {
        id: 'condition',
        name: 'Zustand',
        type: 'dropdown',
        required: false,
        isVisible: true,
        options: ['Mint', 'Near Mint', 'Excellent', 'Good', 'Played', 'Poor'],
        order: 8
      },
      {
        id: 'language',
        name: 'Sprache',
        type: 'dropdown',
        required: false,
        isVisible: true,
        options: ['deutsch', 'englisch', 'japanisch', 'französisch', 'italienisch', 'spanisch'],
        order: 9
      }
    ],
    order: 2,
    isDefault: true
  }
];