import { useCallback } from 'react';
import { useCollectionActions } from '../context/CollectionContext';
import { catalogCardImageSources, cardmarketProductUrl, type CardBrief } from '../services/tcgdex';
import type { CatalogLang, CatalogVariant, Category } from '../types/models';
import { buildCatalogItem } from '../utils/catalogItem';
import { buildCardmarketFilter, pickCatalogPrice } from '../utils/catalogSettings';
import { firstLoadableImage } from '../utils/imageProbe';
import { useCatalogSettings } from './useCatalogSettings';

export interface AddCatalogCardInput {
  category: Category;
  card: CardBrief;
  setId: string;
  setName: string;
  lang: CatalogLang;
  variant: CatalogVariant;
  /** Cardmarket-Preise der Karte (Startwert und Produktlink). */
  price: {
    trend: number | null;
    low: number | null;
    avg30: number | null;
    reverseTrend: number | null;
    reverseLow: number | null;
    idProduct: number | null;
  } | null;
  englishImage?: string;
  /** Sprache sicher bekannt (Kartenscanner): Cardmarket-Link immer danach filtern. */
  strictLanguage?: boolean;
  quantity?: number;
}

/**
 * Legt aus einer Katalogkarte einen Sammlungseintrag an: Bild, Cardmarket-Link
 * mit den eigenen Filtern und Katalogpreis als Startwert. Genutzt von der
 * Kartenansicht und vom Stapel des Kartenscanners (#171). Liefert die neue ID.
 */
export const useAddCatalogCard = () => {
  const { addItem } = useCollectionActions();
  const settings = useCatalogSettings();
  return useCallback(
    async (input: AddCatalogCardInput): Promise<string> => {
      const { category, card, setId, lang, variant, price } = input;
      // Nur ein Bild übernehmen, das sich wirklich laden lässt.
      const image = await firstLoadableImage(catalogCardImageSources(lang, card, setId, 'high', input.englishImage));
      const draft = buildCatalogItem(category, {
        cardId: card.id,
        setId,
        lang,
        setName: input.setName,
        name: card.name,
        localId: card.localId,
        variant,
        price: pickCatalogPrice(price, settings.priceBasis, variant),
        imageUrl: image,
        productUrl: cardmarketProductUrl(
          price?.idProduct,
          card.name,
          buildCardmarketFilter(settings, lang, input.strictLanguage)
        ),
        quantity: input.quantity,
      });
      return addItem(category.id, draft.values, { links: draft.links, images: draft.images, catalog: draft.catalog });
    },
    [addItem, settings]
  );
};
