import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CardModal from './CardModal';
import { useCategoriesData, useCollectionActions, useItemsData } from '../../context/CollectionContext';
import { useFeedback } from '../../context/FeedbackContext';
import { toggleCatalogOwned, useCatalogOwned } from '../../hooks/useCatalogOwned';
import { useCatalogSettings } from '../../hooks/useCatalogSettings';
import { useAddCatalogCard } from '../../hooks/useAddCatalogCard';
import type { CatalogLang, CatalogVariant, Category } from '../../types/models';
import { cardOwnership, catalogSetKey, linkedItemsByCard } from '../../utils/catalogOwnership';
import { buildCardmarketFilter } from '../../utils/catalogSettings';
import { captureRemoved, restoreRemoved } from '../../utils/undo';
import {
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
  /** Sprache der Karte sicher bekannt (Scanner): Cardmarket-Links immer danach filtern. */
  strictLanguage?: boolean;
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
  strictLanguage = false,
  onAdded,
  onClose,
}) => {
  const navigate = useNavigate();
  const items = useItemsData();
  const categories = useCategoriesData();
  const { deleteItem, setItemCatalogRefs, setItems } = useCollectionActions();
  const addCatalogCard = useAddCatalogCard();
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

  const price = detail ? summarizePricing(detail) : null;
  // Direkt zum Produkt, gefiltert wie die Links neuer Einträge.
  const cardmarketUrl =
    price?.idProduct != null
      ? cardmarketProductUrl(price.idProduct, card.name, buildCardmarketFilter(settings, lang, strictLanguage))
      : undefined;

  const add = async (category: Category, variant: CatalogVariant) => {
    const id = await addCatalogCard({
      category,
      card,
      setId,
      setName: setName ?? detail?.set.name ?? setId,
      lang,
      variant,
      price,
      englishImage,
      strictLanguage,
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
      cardmarketUrl={cardmarketUrl}
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
