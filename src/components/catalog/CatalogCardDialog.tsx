import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CardModal from './CardModal';
import { useCategoriesData, useCollectionActions, useItemsData } from '../../context/CollectionContext';
import { useFeedback } from '../../context/FeedbackContext';
import { toggleCatalogOwned, useCatalogOwned } from '../../hooks/useCatalogOwned';
import { useCatalogSettings } from '../../hooks/useCatalogSettings';
import type { CatalogLang, CatalogVariant, Category } from '../../types/models';
import { buildCatalogItem } from '../../utils/catalogItem';
import { cardOwnership, catalogSetKey, linkedItemsByCard } from '../../utils/catalogOwnership';
import { buildCardmarketFilter, pickCatalogPrice } from '../../utils/catalogSettings';
import { firstLoadableImage } from '../../utils/imageProbe';
import { captureRemoved, restoreRemoved } from '../../utils/undo';
import {
  catalogCardImageSources,
  cardmarketProductUrl,
  fetchCard,
  summarizePricing,
  type CardBrief,
  type CardDetail,
} from '../../services/tcgdex';

// Detailansicht einer Katalogkarte samt Bestand und „In Sammlung übernehmen“.
// Der Kartenkatalog reicht die schon geladenen Details herein; der
// Kartenscanner (#169) lädt sie hier nach und bleibt nach dem Übernehmen
// auf seiner Seite (onAdded).

interface CatalogCardDialogProps {
  card: CardBrief;
  setId: string;
  setName?: string;
  lang: CatalogLang;
  /** Schon geladene Details (Preise); sonst werden sie hier geladen. */
  detail?: CardDetail;
  englishImage?: string;
  initialVariant?: CatalogVariant;
  /** Nach dem Übernehmen; ohne Angabe geht es zum neuen Eintrag. */
  onAdded?: (category: Category, itemId: string, name: string) => void;
  onClose: () => void;
}

const CatalogCardDialog: React.FC<CatalogCardDialogProps> = ({
  card,
  setId,
  setName,
  lang,
  detail: givenDetail,
  englishImage,
  initialVariant,
  onAdded,
  onClose,
}) => {
  const navigate = useNavigate();
  const items = useItemsData();
  const categories = useCategoriesData();
  const { addItem, deleteItem, setItemCatalogRefs, setItems } = useCollectionActions();
  const { notify } = useFeedback();
  const settings = useCatalogSettings();
  const setKey = catalogSetKey(setId, lang);
  const checked = useCatalogOwned()[setKey];
  const linked = useMemo(() => linkedItemsByCard(items, setId, lang), [items, setId, lang]);
  const [loadedDetail, setLoadedDetail] = useState<CardDetail | undefined>();
  const detail = givenDetail ?? loadedDetail;

  useEffect(() => {
    if (givenDetail) return;
    const controller = new AbortController();
    fetchCard(card.id, controller.signal, lang)
      .then((d) => !controller.signal.aborted && setLoadedDetail(d))
      .catch(() => undefined);
    return () => controller.abort();
  }, [card.id, lang, givenDetail]);

  // Esc schließt die Ansicht.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const add = async (category: Category, variant: CatalogVariant) => {
    const price = detail ? summarizePricing(detail) : null;
    // Nur ein Bild übernehmen, das sich wirklich laden lässt.
    const image = await firstLoadableImage(catalogCardImageSources(lang, card, setId, 'high', englishImage));
    const draft = buildCatalogItem(category, {
      cardId: card.id,
      setId,
      lang,
      setName: setName ?? detail?.set.name ?? setId,
      name: card.name,
      localId: card.localId,
      variant,
      price: pickCatalogPrice(price, settings.priceBasis, variant),
      imageUrl: image,
      productUrl: cardmarketProductUrl(price?.idProduct, card.name, buildCardmarketFilter(settings, lang)),
    });
    const id = addItem(category.id, draft.values, {
      links: draft.links,
      images: draft.images,
      catalog: draft.catalog,
    });
    if (onAdded) onAdded(category, id, card.name);
    else navigate(`/category/${category.id}?highlight=${id}`);
  };

  return (
    <CardModal
      card={card}
      detail={detail}
      englishImage={englishImage}
      setId={setId}
      setName={setName}
      lang={lang}
      ownership={cardOwnership(checked?.[card.id], linked[card.id])}
      categories={categories}
      initialVariant={initialVariant}
      onToggle={(variant) => toggleCatalogOwned(setKey, card.id, variant)}
      onAdd={add}
      onUnlink={(itemId) => setItemCatalogRefs({ [itemId]: null })}
      onDelete={(item) => {
        const removed = captureRemoved(items, [item.id]);
        deleteItem(item.id);
        notify(`„${String(item.values?.name || 'Eintrag')}“ aus der Sammlung gelöscht`, {
          undo: () => setItems((prev) => restoreRemoved(prev, removed)),
        });
      }}
      onClose={onClose}
    />
  );
};

export default CatalogCardDialog;
