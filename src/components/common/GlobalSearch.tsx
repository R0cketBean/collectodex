import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { useCategoriesData, useCollectionActions, useItemsData } from '../../context/CollectionContext';
import { buildSearchIndex, searchEntries, type SearchHit } from '../../utils/globalSearch';
import { getPrimaryImage } from '../../utils/itemImages';
import { formatEur } from '../../utils/format';
import { tileSubtitle } from '../items/ItemTileGrid';
import Thumbnail from './Thumbnail';

// Suchfenster über alle Kategorien (#130). Öffnet sich über die Seitenleiste
// oder mit Cmd/Strg+K; Enter springt zum Eintrag in seiner Kategorie.

const MAX_HITS = 50;

/** Kürzel, wie es auf dieser Plattform heißt. */
export const searchShortcutLabel = (): string =>
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Strg+K';

interface GlobalSearchProps {
  onClose: () => void;
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const hitDetail = (hit: SearchHit): string =>
  [hit.category.name, hit.matched ? `${hit.matched.label}: ${hit.matched.value}` : tileSubtitle(hit.item)]
    .filter(Boolean)
    .join(' · ');

const GlobalSearch: React.FC<GlobalSearchProps> = ({ onClose }) => {
  const items = useItemsData();
  const categories = useCategoriesData();
  const { calculateItemValue } = useCollectionActions();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const index = useMemo(() => buildSearchIndex(items, categories), [items, categories]);
  const { hits, total } = useMemo(() => searchEntries(index, deferredQuery, MAX_HITS), [index, deferredQuery]);

  // Fokus ins Feld; beim Schließen zurück dorthin, wo er vorher war.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    setActive(0);
  }, [deferredQuery]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active, hits]);

  const open = (hit: SearchHit) => {
    onClose();
    navigate(`/category/${hit.category.id}?highlight=${hit.item.id}`);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && hits[active]) {
      event.preventDefault();
      open(hits[active]);
    }
  };

  const hasQuery = deferredQuery.trim() !== '';
  const activeId = hits[active] ? `global-search-hit-${hits[active].item.id}` : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Sammlung durchsuchen"
      onKeyDown={onKeyDown}
    >
      <div className="fixed inset-0 bg-gray-900/50" onClick={onClose} aria-hidden="true" />
      <div className="relative flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/10 dark:bg-gray-800 dark:ring-white/10">
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 dark:border-gray-700">
          <MagnifyingGlassIcon className="h-5 w-5 flex-shrink-0 text-gray-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls="global-search-hits"
            aria-activedescendant={activeId}
            aria-label="Sammlung durchsuchen"
            autoComplete="off"
            spellCheck={false}
            placeholder="In allen Kategorien suchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full border-0 bg-transparent py-4 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>

        {!hasQuery && (
          <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
            Sucht im Namen und in Feldern wie Erweiterung, Zustand oder Sprache. Mehrere Wörter grenzen ein, zum
            Beispiel „Glurak PSA“.
          </p>
        )}
        {hasQuery && hits.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
            Kein Eintrag passt zu „{deferredQuery.trim()}“.
          </p>
        )}

        {hits.length > 0 && (
          <ul ref={listRef} id="global-search-hits" role="listbox" aria-label="Treffer" className="overflow-y-auto p-2">
            {hits.map((hit, i) => {
              const image = getPrimaryImage(hit.item.images);
              const value = num(calculateItemValue(hit.item).totalValue) ?? num(hit.item.values?.currentValue);
              const placeholder = <PhotoIcon className="h-5 w-5 text-gray-300 dark:text-gray-600" aria-hidden="true" />;
              return (
                <li
                  key={hit.item.id}
                  id={`global-search-hit-${hit.item.id}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={() => open(hit)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 ${
                    i === active ? 'bg-blue-50 dark:bg-gray-700' : ''
                  }`}
                >
                  <div className="relative flex h-12 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-gray-100 dark:bg-gray-900">
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
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{hit.name}</div>
                    <div className="truncate text-xs text-gray-500 dark:text-gray-400">{hitDetail(hit)}</div>
                  </div>
                  {value !== null && (
                    <div className="flex-shrink-0 text-sm tabular-nums text-gray-700 dark:text-gray-300">
                      {formatEur(value)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
          <span>↑↓ wählen · ↵ öffnen · Esc schließen</span>
          {hasQuery && total > 0 && (
            <span aria-live="polite">
              {total > hits.length ? `${hits.length} von ${total} Treffern` : total === 1 ? '1 Treffer' : `${total} Treffer`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default GlobalSearch;
