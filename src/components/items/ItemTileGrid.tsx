import React from 'react';
import { MagnifyingGlassPlusIcon, PhotoIcon } from '@heroicons/react/24/outline';
import type { CollectionItem } from '../../types/models';
import { countImages, getPrimaryImage } from '../../utils/itemImages';
import { formatEur, formatSignedEur } from '../../utils/format';
import Thumbnail from '../common/Thumbnail';

// Kachelansicht einer Kategorie (#128): Bild, Name, Wert, Gewinn/Verlust.
// Suche, Filter, Sortierung und Mehrfachauswahl teilt sie sich mit der Tabelle.

interface ItemTileGridProps {
  items: CollectionItem[];
  calculateItemValue: (item: CollectionItem) => Record<string, any>;
  selectedIds: string[];
  onToggleSelect: (itemId: string) => void;
  /** Öffnet den Eintrag zum Bearbeiten. */
  onOpen: (item: CollectionItem) => void;
  /** Öffnet die Bilder des Eintrags in der Großansicht. */
  onOpenImages: (item: CollectionItem) => void;
  highlightedItemId: string | null;
  highlightRef: React.MutableRefObject<HTMLElement | null>;
  /** Bildfläche im Kartenformat (hochkant) statt quadratisch, für Kategorien mit Karten. */
  portrait?: boolean;
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Zweite Zeile der Kachel: Stückzahl (ab zwei) und Erweiterung bzw. Produktart. */
export const tileSubtitle = (item: Pick<CollectionItem, 'values'>): string => {
  const quantity = num(item.values?.quantity);
  const detail = [item.values?.expansion, item.values?.category].find(
    (v): v is string => typeof v === 'string' && v.trim() !== ''
  );
  return [quantity !== null && quantity > 1 ? `${quantity} Stück` : null, detail?.trim()].filter(Boolean).join(' · ');
};

const ItemTileGrid: React.FC<ItemTileGridProps> = ({
  items,
  calculateItemValue,
  selectedIds,
  onToggleSelect,
  onOpen,
  onOpenImages,
  highlightedItemId,
  highlightRef,
  portrait = false,
}) => {
  const selected = new Set(selectedIds);
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {items.map((item) => {
        const calculated = calculateItemValue(item);
        const name = String(item.values?.name || 'Unbenannt');
        const subtitle = tileSubtitle(item);
        const totalValue = num(calculated.totalValue) ?? num(item.values?.currentValue);
        const profitLoss = num(calculated.profitLoss);
        const image = getPrimaryImage(item.images);
        const imageCount = countImages(item.images);
        const isSelected = selected.has(item.id);
        const placeholder = (
          <PhotoIcon className="h-10 w-10 text-gray-300 dark:text-gray-600" aria-hidden="true" />
        );
        return (
          <li
            key={item.id}
            ref={(el) => {
              if (item.id === highlightedItemId) highlightRef.current = el;
            }}
            className={`group relative flex flex-col overflow-hidden rounded-lg bg-white dark:bg-gray-800 shadow transition hover:ring-2 hover:ring-pokemon-blue ${
              item.id === highlightedItemId ? 'ring-2 ring-yellow-400' : isSelected ? 'ring-2 ring-pokemon-blue' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => onOpen(item)}
              aria-label={`${name} bearbeiten`}
              className="flex flex-1 flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pokemon-blue"
            >
              {/* Feste Bildfläche; das Bild liegt darin, damit alle Kacheln einer Reihe gleich hoch sind. */}
              <div
                className={`relative flex w-full items-center justify-center bg-gray-100 dark:bg-gray-900 ${
                  portrait ? 'aspect-[5/7]' : 'aspect-square'
                }`}
              >
                {image ? (
                  <Thumbnail
                    image={image}
                    alt=""
                    className="absolute inset-0 h-full w-full object-contain"
                    fallback={placeholder}
                  />
                ) : (
                  placeholder
                )}
              </div>
              <div className="flex flex-1 flex-col p-3">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{name}</div>
                {subtitle && <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{subtitle}</div>}
                <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-2 pt-2 tabular-nums">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {totalValue !== null ? formatEur(totalValue) : '–'}
                  </span>
                  {profitLoss !== null && (
                    <span
                      className={`text-xs font-medium ${
                        profitLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}
                      title="Gewinn/Verlust"
                    >
                      {formatSignedEur(profitLoss)}
                    </span>
                  )}
                </div>
              </div>
            </button>

            {/* Auswahl für die Massenbearbeitung: sichtbar beim Überfahren oder sobald etwas ausgewählt ist. */}
            <label
              className={`absolute left-2 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-white/90 dark:bg-gray-900/80 shadow transition-opacity ${
                isSelected || selectedIds.length > 0
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
              }`}
            >
              <span className="sr-only">{name} auswählen</span>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(item.id)}
                className="h-4 w-4 rounded text-pokemon-blue"
              />
            </label>

            {imageCount > 0 && (
              <button
                type="button"
                onClick={() => onOpenImages(item)}
                title={imageCount > 1 ? `${imageCount} Bilder ansehen` : 'Bild vergrößern'}
                aria-label={`Bilder von ${name} ansehen`}
                className="absolute right-2 top-2 flex h-7 items-center gap-1 rounded-md bg-white/90 dark:bg-gray-900/80 px-1.5 text-gray-700 dark:text-gray-200 shadow opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-pokemon-blue"
              >
                <MagnifyingGlassPlusIcon className="h-4 w-4" aria-hidden="true" />
                {imageCount > 1 && <span className="text-xs tabular-nums">{imageCount}</span>}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default ItemTileGrid;
