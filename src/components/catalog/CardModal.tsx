import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import FallbackImage from './FallbackImage';
import type { CatalogLang, CatalogVariant, Category, CollectionItem } from '../../types/models';
import type { CardOwnership } from '../../utils/catalogOwnership';
import {
  catalogCardImageSources,
  cardmarketSearchUrl,
  formatEur,
  summarizePricing,
  type CardBrief,
  type CardDetail,
} from '../../services/tcgdex';
import { primaryButtonSmallClass, selectClass } from '../../utils/formStyles';

// Detailansicht einer Katalogkarte: Bild, Cardmarket-Preise, Bestand und
// „In Sammlung übernehmen“. Genutzt im Kartenkatalog und im Kartenscanner.

const openExternal = (url: string) => {
  if (window.electronAPI?.openExternalURL) {
    void window.electronAPI.openExternalURL(url);
  } else {
    window.open(url, '_blank', 'noopener');
  }
};

const PriceRow: React.FC<{ label: string; value: number | null }> = ({ label, value }) => (
  <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
    <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
    <dd className="font-medium text-gray-900 dark:text-gray-100 tabular-nums">{formatEur(value)}</dd>
  </div>
);

export interface CardModalProps {
  card: CardBrief;
  detail?: CardDetail;
  englishImage?: string;
  setId: string;
  /** Anzeigename des Sets (bei japanischen Sets der englische). */
  setName?: string;
  lang: CatalogLang;
  ownership: CardOwnership;
  categories: Category[];
  onToggle: (variant: CatalogVariant) => void;
  onAdd: (category: Category, variant: CatalogVariant) => void | Promise<void>;
  onUnlink: (itemId: string) => void;
  onDelete: (item: CollectionItem) => void;
  /**
   * Link zum Cardmarket-Produkt mit den eigenen Filtern (Land, Sprache der
   * Karte, Zustand). Ohne Produktnummer bleibt die Suche nach dem Namen.
   */
  cardmarketUrl?: string;
  /** Vorauswahl beim Übernehmen, z. B. Reverse Holo aus dem Kartenscanner. */
  initialVariant?: CatalogVariant;
  onClose: () => void;
}

const CardModal: React.FC<CardModalProps> = ({ card, detail, englishImage, setId, setName, lang, ownership, categories, onToggle, onAdd, onUnlink, onDelete, initialVariant = 'normal', cardmarketUrl, onClose }) => {
  const price = detail ? summarizePricing(detail) : null;
  const hasReverse = lang !== 'ja' && Boolean(detail?.variants?.reverse);
  // Nur Kategorien mit Attributen taugen als Ziel (unvollständig angelegte fallen raus).
  const targets = categories.filter((c) => Array.isArray(c.attributes) && c.attributes.length > 0);
  const [targetId, setTargetId] = useState(
    () => (targets.find((c) => c.id === 'singles') ?? targets[0])?.id ?? ''
  );
  const [addVariant, setAddVariant] = useState<CatalogVariant>(initialVariant);
  const target = targets.find((c) => c.id === targetId);
  const variantLabel = (v: CatalogVariant) => (v === 'reverse' ? 'Reverse Holo' : hasReverse ? 'Normal' : 'Vorhanden');
  const categoryName = (item: CollectionItem) =>
    categories.find((c) => c.id === item.categoryId)?.name ?? 'Sammlung';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={card.name}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-full overflow-y-auto rounded-lg bg-white dark:bg-gray-800 shadow-xl">
        <button
          onClick={onClose}
          aria-label="Schließen"
          className="absolute top-3 right-3 rounded-full p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
        <div className="flex flex-col md:flex-row gap-6 p-6">
          <div className="relative md:w-1/2 flex-shrink-0">
            <FallbackImage
              sources={catalogCardImageSources(lang, card, setId, 'high', englishImage)}
              alt={card.name}
              showLanguageBadge={lang === 'de'}
              className="w-full rounded-lg shadow"
              fallback={
                <div className="aspect-[5/7] rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center text-sm text-gray-400">
                  Kein Bild
                </div>
              }
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 pr-8">{card.name}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {setName ?? detail?.set.name} · Nr. {card.localId}
              {detail?.rarity && ` · ${detail.rarity}`}
            </p>
            {detail?.types && detail.types.length > 0 && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Typ: {detail.types.join(', ')}</p>
            )}
            {detail?.illustrator && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Illustration: {detail.illustrator}</p>
            )}

            <h3 className="mt-6 text-sm font-semibold text-gray-900 dark:text-gray-100">Cardmarket-Preise</h3>
            {!detail ? (
              <p className="mt-2 text-sm text-gray-500">Preise werden geladen…</p>
            ) : price && price.trend === null && price.low === null ? (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Für diese Karte gibt es keinen Preis.</p>
            ) : (
              <dl className="mt-2 text-sm">
                <PriceRow label="Trend" value={price?.trend ?? null} />
                <PriceRow label="Ab (günstigstes Angebot)" value={price?.low ?? null} />
                <PriceRow label="Ø 30 Tage" value={price?.avg30 ?? null} />
                {price?.reverseTrend !== null && <PriceRow label="Reverse Holo – Trend" value={price?.reverseTrend ?? null} />}
                {price?.reverseLow !== null && <PriceRow label="Reverse Holo – ab" value={price?.reverseLow ?? null} />}
              </dl>
            )}
            {price?.updated && (
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                Stand {new Date(price.updated).toLocaleDateString('de-DE')} · Preise über alle Sprachen und Zustände
              </p>
            )}

            <button
              onClick={() => openExternal(cardmarketUrl ?? cardmarketSearchUrl(card.name))}
              className="mt-4 text-sm text-pokemon-blue dark:text-blue-300 hover:underline"
            >
              {cardmarketUrl ? 'Auf Cardmarket öffnen' : 'Auf Cardmarket suchen'}
            </button>

            <h3 className="mt-6 text-sm font-semibold text-gray-900 dark:text-gray-100">Dein Bestand</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['normal', ...(hasReverse ? ['reverse'] : [])] as CatalogVariant[]).map((variant) => {
                const has = ownership.variants.includes(variant);
                const viaEntry = ownership.entryVariants.includes(variant);
                return (
                  <button
                    key={variant}
                    type="button"
                    onClick={() => onToggle(variant)}
                    disabled={viaEntry}
                    aria-pressed={has}
                    title={viaEntry ? 'Durch einen Sammlungseintrag vorhanden' : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                      has
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-green-500'
                    } ${viaEntry ? 'cursor-default' : ''}`}
                  >
                    <CheckIcon className={`h-4 w-4 ${has ? '' : 'opacity-30'}`} strokeWidth={3} />
                    {variantLabel(variant)}
                  </button>
                );
              })}
            </div>

            {ownership.items.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {ownership.items.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Link
                      to={`/category/${item.categoryId}?highlight=${item.id}`}
                      className="text-pokemon-blue dark:text-blue-300 hover:underline"
                    >
                      Eintrag in „{categoryName(item)}“ öffnen
                    </Link>
                    <button
                      type="button"
                      onClick={() => onUnlink(item.id)}
                      title="Der Eintrag bleibt in deiner Sammlung, zählt hier aber nicht mehr als vorhanden"
                      className="text-xs text-gray-500 dark:text-gray-400 hover:underline"
                    >
                      Verknüpfung lösen
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item)}
                      title="Entfernt den Eintrag ganz aus deiner Sammlung, etwa nach einem Verkauf"
                      className="text-xs text-red-600 dark:text-red-400 hover:underline"
                    >
                      Eintrag löschen
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {target && (
              <div className="mt-4 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    aria-label="Zielkategorie"
                    className={`${selectClass} min-w-0 flex-1 py-1.5`}
                  >
                    {targets.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {hasReverse && (
                    <select
                      value={addVariant}
                      onChange={(e) => setAddVariant(e.target.value as CatalogVariant)}
                      aria-label="Fassung"
                      className={`${selectClass} w-auto py-1.5`}
                    >
                      <option value="normal">Normal</option>
                      <option value="reverse">Reverse Holo</option>
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => void onAdd(target, hasReverse ? addVariant : 'normal')}
                    disabled={!detail}
                    className={primaryButtonSmallClass}
                  >
                    In Sammlung übernehmen
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Legt einen Eintrag mit Bild, Cardmarket-Link und dem Katalogpreis als Startwert an. Kaufpreis und
                  Wert pflegst du danach wie gewohnt.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


export default CardModal;
