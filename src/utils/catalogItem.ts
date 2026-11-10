// Baut aus einer Katalogkarte die Daten für einen neuen Sammlungseintrag.

import type { CatalogRef, CatalogVariant, Category } from '../types/models';
import { FRONT_IMAGE_KEY } from './itemImages';

export interface CatalogItemSource {
  cardId: string;
  setId: string;
  setName: string;
  name: string;
  localId: string;
  variant: CatalogVariant;
  /** Katalogpreis als Startwert – der Nutzer pflegt den echten Wert danach selbst. */
  price: number | null;
  imageUrl?: string;
  productUrl?: string;
}

export interface CatalogItemDraft {
  values: Record<string, unknown>;
  links: Record<string, string>;
  images: Record<string, string>;
  catalog: CatalogRef;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const todayIso = (now = new Date()) =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/**
 * Name des Eintrags: nur der Kartenname. Das Set steht im Feld „Erweiterung“,
 * die Kartennummer ergibt sich über die Verknüpfung mit der Katalogkarte.
 */
export const catalogItemName = (source: Pick<CatalogItemSource, 'name' | 'variant'>) =>
  `${source.name}${source.variant === 'reverse' ? ' (Reverse Holo)' : ''}`;

export const buildCatalogItem = (
  category: Pick<Category, 'attributes'>,
  source: CatalogItemSource,
  today = todayIso()
): CatalogItemDraft => {
  const known: Record<string, unknown> = {
    name: catalogItemName(source),
    quantity: 1,
    purchasePrice: 0,
    currentValue: source.price ?? 0,
    addedDate: today,
    expansion: source.setName,
  };
  const values: Record<string, unknown> = {};
  for (const attr of category.attributes ?? []) {
    if (attr.isCalculated || attr.type === 'formula' || attr.type === 'image' || attr.type === 'link') continue;
    if (attr.id in known) values[attr.id] = known[attr.id];
    else if (attr.id === 'language' && attr.options?.includes('deutsch')) values[attr.id] = 'deutsch';
    else if (attr.type === 'number') values[attr.id] = 0;
    else if (attr.type === 'boolean') values[attr.id] = false;
    else if (attr.type === 'date') values[attr.id] = null;
    else values[attr.id] = '';
  }
  return {
    values,
    links: source.productUrl ? { product: source.productUrl } : {},
    images: source.imageUrl ? { [FRONT_IMAGE_KEY]: source.imageUrl } : {},
    catalog: { cardId: source.cardId, setId: source.setId, variant: source.variant },
  };
};
