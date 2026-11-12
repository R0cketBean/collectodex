import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowsUpDownIcon,
  BarsArrowUpIcon,
  BarsArrowDownIcon,
  ArrowUpCircleIcon,
  CameraIcon,
  PhotoIcon,
  LinkIcon,
  Squares2X2Icon,
  TableCellsIcon,
  RectangleStackIcon,
} from '@heroicons/react/24/outline';
import { ChevronRightIcon } from '@heroicons/react/20/solid';
import { useCategoriesData, useItemsData, useCollectionActions } from '../context/CollectionContext';
import { CollectionItem } from '../types/models';
import { logger } from '../utils/logger';
import { getOrderedImages, getPrimaryImage, countImages, ItemImage } from '../utils/itemImages';
import ImageLightbox from '../components/common/ImageLightbox';
import ItemModal from '../components/items/ItemModal';
import BulkEditModal from '../components/items/BulkEditModal';
import ItemTileGrid from '../components/items/ItemTileGrid';
import EmptyState from '../components/common/EmptyState';
import Thumbnail from '../components/common/Thumbnail';
import { formatAttributeNumber, formatEur, formatSignedEur } from '../utils/format';
import { dangerButtonClass, inputClass, primaryButtonClass, secondaryButtonClass, selectClass } from '../utils/formStyles';
import { useFeedback } from '../context/FeedbackContext';
import { captureChanged, captureRemoved, restoreChanged, restoreRemoved } from '../utils/undo';
import { getItemViewMode, setItemViewMode, type ItemViewMode } from '../utils/viewMode';

// Reagiert auf die Tailwind md-Breakpoint-Grenze (768px). Damit rendern wir
// nur die zum Viewport passende Variante (Tabelle ODER mobile Liste) statt
// beide gleichzeitig — das halbiert bei großen Kategorien die gerenderten
// Zeilen-Subtrees und damit die Render-/Wechselzeit (#67).
const useIsDesktop = (): boolean => {
  const query = '(min-width: 768px)';
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : true
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
};

const CategoryItemsList: React.FC = () => {
  const isDesktop = useIsDesktop();
  // Re-Render-Isolation (#18): Categories-Slice + (stabile) Actions gezielt.
  const categories = useCategoriesData();
  const {
    addItem,
    updateItem,
    updateMultipleItems,
    deleteItem,
    deleteMultipleItems,
    calculateItemValue,
    setItems,
  } = useCollectionActions();
  const { notify } = useFeedback();
  // Alle Items als eigener Slice (#18): Die Kategorie-Liste wird unten direkt
  // daraus gefiltert, statt über das (nun referenz-stabile) getItemsByCategoryId
  // — sonst ginge die items-Memo stale (würde bei Item-Mutationen nicht neu
  // rechnen, weil die Funktions-Referenz konstant bleibt).
  const allItems = useItemsData();
  
  const { categoryId } = useParams<{ categoryId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const category = useMemo(() => {
    return categories.find(cat => cat.id === categoryId);
  }, [categories, categoryId]);
  
  // Items dieser Kategorie aus dem Items-Slice ableiten — recomputed korrekt,
  // sobald sich allItems (Anlegen/Bearbeiten/Löschen) oder categoryId ändert.
  const items = useMemo(() => {
    return categoryId ? allItems.filter(item => item.categoryId === categoryId) : [];
  }, [categoryId, allItems]);
  
  // Tabelle oder Kacheln (#128); die Wahl wird je Kategorie gemerkt.
  const [viewMode, setViewMode] = useState<ItemViewMode>(() => getItemViewMode(categoryId));
  useEffect(() => {
    setViewMode(getItemViewMode(categoryId));
  }, [categoryId]);
  const chooseViewMode = (mode: ItemViewMode) => {
    setViewMode(mode);
    if (categoryId) setItemViewMode(categoryId, mode);
  };

  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingItem, setEditingItem] = useState<CollectionItem | null>(null);

  // Zustände für UI
  const [selectedFilter, setSelectedFilter] = useState<string>('');
  const [showItemModal, setShowItemModal] = useState(false);
  // Massenbearbeitung der aktuell ausgewählten Einträge
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);

  // Zustand für den zoombaren Bild-Lightbox (#1)
  const [lightbox, setLightbox] = useState<{ images: ItemImage[]; index: number } | null>(null);

  // Öffnet den Lightbox mit allen Bildern eines Eintrags, optional ab einem Slot.
  const openLightbox = useCallback((targetItem: CollectionItem, startKey?: string) => {
    const images = getOrderedImages(targetItem.images);
    if (images.length === 0) return;
    const start = startKey ? images.findIndex(img => img.key === startKey) : 0;
    setLightbox({ images, index: start >= 0 ? start : 0 });
  }, []);

  // Zustände für Hover-Bild
  const [hoverImage, setHoverImage] = useState<string | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{x: number, y: number} | null>(null);

  // Sichtbare Attribute (für die Tabelle)
  const visibleAttributes = useMemo(() => {
    if (!category || !category.attributes) return [];
    return category.attributes
      .filter(attr => attr.isVisible === true)
      .sort((a, b) => a.order - b.order);
  }, [category]);
  
  // Filterbare Attribute (für das Filtermenü)
  const filterableAttributes = useMemo(() => {
    if (!category || !category.attributes) return [];
    return category.attributes.filter(attr => 
      attr.type === 'text' || 
      attr.type === 'dropdown' || 
      attr.type === 'boolean'
    );
  }, [category]);
  
  // Einzigartige Werte für die Filterung finden
  const filterValues = useMemo(() => {
    if (!selectedFilter) return [];
    
    const values = new Set<string>();
    
    items.forEach(item => {
      const value = item.values[selectedFilter];
      if (value !== null && value !== undefined) {
        values.add(String(value));
      }
    });
    
    return Array.from(values).sort();
  }, [items, selectedFilter]);
  
  // Filterwert
  const [filterValue, setFilterValue] = useState<string>('');

  // #25: Beim Sprung von den Dashboard-Top-Performern wird ?highlight=<id>
  // übergeben. Wir scrollen zum betreffenden Item und heben es kurz hervor.
  const highlightParam = searchParams.get('highlight');
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!highlightParam) return;
    setHighlightedItemId(highlightParam);

    // Nach dem Rendern zum Item scrollen.
    const scrollTimer = window.setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);

    // Hervorhebung nach einigen Sekunden ausblenden und den Param aus der
    // URL entfernen, damit ein Reload nicht erneut highlightet.
    const clearTimer = window.setTimeout(() => {
      setHighlightedItemId(null);
      const next = new URLSearchParams(searchParams);
      next.delete('highlight');
      setSearchParams(next, { replace: true });
    }, 3000);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
    // Nur auf Änderung des highlight-Params reagieren.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightParam]);

  // Handhabung der Sortierung
  const handleSort = (attributeId: string) => {
    if (sortBy === attributeId) {
      // Wenn bereits nach diesem Attribut sortiert wird, ändere die Richtung
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Andernfalls sortiere nach diesem Attribut aufsteigend
      setSortBy(attributeId);
      setSortDirection('asc');
    }
  };
  
  // Gefilterte und sortierte Items
  const filteredAndSortedItems = useMemo(() => {
    if (!items.length) return [];
    
    // Filtere die Items
    let result = [...items];
    
    // Textsuche — durchsucht Text- UND Dropdown-Attribute (z.B. Sprache,
    // Zustand, Grade), damit man auch nach "englisch", "PSA", "Near Mint"
    // suchen kann, nicht nur nach dem Namen.
    if (searchTerm) {
      const needle = searchTerm.toLowerCase();
      result = result.filter(item => {
        for (const attr of category?.attributes || []) {
          if (
            (attr.type === 'text' || attr.type === 'dropdown') &&
            item.values[attr.id]
          ) {
            const value = String(item.values[attr.id]).toLowerCase();
            if (value.includes(needle)) {
              return true;
            }
          }
        }
        return false;
      });
    }
    
    // Attributfilter
    if (selectedFilter && filterValue) {
      result = result.filter(item => {
        const value = item.values[selectedFilter];
        return value !== undefined && String(value) === filterValue;
      });
    }
    
    // Sortiere die Items
    result.sort((a, b) => {
      let valueA = a.values[sortBy];
      let valueB = b.values[sortBy];
      
      // Bei berechneten Werten neu berechnen
      const attribute = category?.attributes?.find(attr => attr.id === sortBy);
      if (attribute?.isCalculated) {
        const calculatedA = calculateItemValue(a);
        const calculatedB = calculateItemValue(b);
        valueA = calculatedA[sortBy];
        valueB = calculatedB[sortBy];
      }
      
      // Standardwerte für null/undefined
      if (valueA === null || valueA === undefined) valueA = '';
      if (valueB === null || valueB === undefined) valueB = '';
      
      // Vergleich basierend auf Typ
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return sortDirection === 'asc' ? valueA - valueB : valueB - valueA;
      }
      
      // String-Vergleich
      const strA = String(valueA).toLowerCase();
      const strB = String(valueB).toLowerCase();
      
      return sortDirection === 'asc' 
        ? strA.localeCompare(strB) 
        : strB.localeCompare(strA);
    });
    
    return result;
  }, [items, searchTerm, selectedFilter, filterValue, sortBy, sortDirection, category, calculateItemValue]);

  // Sprung zu einem Eintrag (#130), den Suche oder Filter gerade ausblenden:
  // beides zurücksetzen, sonst liefe der Sprung ins Leere.
  useEffect(() => {
    if (!highlightParam || (!searchTerm && !selectedFilter)) return;
    if (!items.some((item) => item.id === highlightParam)) return;
    if (filteredAndSortedItems.some((item) => item.id === highlightParam)) return;
    setSearchTerm('');
    setSelectedFilter('');
    setFilterValue('');
    // Nur beim Sprung selbst prüfen, nicht bei jedem Tippen im Suchfeld.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightParam, items]);
  
  // Löschen fragt nicht mehr nach (#131): Der Eintrag verschwindet sofort, die
  // Meldung bietet einige Sekunden lang „Rückgängig“ an.
  const handleDeleteItem = (itemId: string) => {
    const removed = captureRemoved(allItems, [itemId]);
    if (removed.length === 0) return;
    deleteItem(itemId);
    setSelectedItems(prev => prev.filter(id => id !== itemId));
    const name = String(removed[0].item.values?.name || 'Eintrag');
    notify(`„${name}“ gelöscht`, { undo: () => setItems(prev => restoreRemoved(prev, removed)) });
  };

  const handleDeleteSelectedItems = () => {
    const removed = captureRemoved(allItems, selectedItems);
    if (removed.length === 0) return;
    deleteMultipleItems(selectedItems);
    setSelectedItems([]);
    notify(removed.length === 1 ? '1 Eintrag gelöscht' : `${removed.length} Einträge gelöscht`, {
      undo: () => setItems(prev => restoreRemoved(prev, removed)),
    });
  };

  // Wendet die in der Massenbearbeitung gesetzten Attribute auf alle
  // ausgewählten Einträge an.
  const handleBulkEditApply = (values: Record<string, any>) => {
    const count = selectedItems.length;
    if (count === 0 || Object.keys(values).length === 0) {
      setShowBulkEditModal(false);
      return;
    }
    const before = captureChanged(allItems, selectedItems);
    updateMultipleItems(selectedItems, values);
    setShowBulkEditModal(false);
    setSelectedItems([]);
    notify(count === 1 ? '1 Eintrag geändert' : `${count} Einträge geändert`, {
      undo: () => setItems(prev => restoreChanged(prev, before)),
    });
  };
  
  // Funktion zum Bearbeiten eines Items
  const handleEditItem = (item: CollectionItem) => {
    setEditingItem(item);
    setShowItemModal(true);
  };
  
  // Funktion zum Hinzufügen eines neuen Items
  const handleAddItem = () => {
    setEditingItem(null);
    setShowItemModal(true);
  };
  
  const handleSaveItem = (
    values: Record<string, any>,
    options?: {
      links?: { [attributeId: string]: string };
      images?: { [attributeId: string]: string };
    }
  ): string => {
    if (editingItem) {
      try {
        updateItem(editingItem.id, values);
        setEditingItem(null);

        // Anzeigen einer Erfolgsmeldung
        notify('Eintrag gespeichert');

        return editingItem.id;
      } catch (error) {
        console.error('Fehler beim Speichern des Items:', error);
        notify('Der Eintrag ließ sich nicht speichern', { kind: 'error' });
        return '';
      }
    } else {
      // Neues Item: Links/Bilder direkt beim Anlegen mitgeben.
      return addItem(categoryId || '', values, options);
    }
  };
  
  // Funktionen für Mehrfachauswahl
  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId) 
        : [...prev, itemId]
    );
  };
  
  const toggleSelectAll = () => {
    if (selectedItems.length === filteredAndSortedItems.length) {
      // Wenn alle ausgewählt sind, Auswahl aufheben
      setSelectedItems([]);
    } else {
      // Sonst alle auswählen
      setSelectedItems(filteredAndSortedItems.map(item => item.id));
    }
  };
  
  // Summen je numerischem Attribut — memoisiert, damit sie nicht bei jedem
  // Render (z.B. Hover, Tippen in der Suche) neu über alle Items berechnet
  // werden (#67). calculateItemValue wird einmal pro Item aufgerufen.
  const sums = useMemo(() => {
    const result: Record<string, number> = {};

    const numericAttributes = category?.attributes?.filter(attr =>
      attr.type === 'number' || attr.type === 'formula'
    ) || [];

    numericAttributes.forEach(attr => {
      result[attr.id] = 0;
    });

    filteredAndSortedItems.forEach(item => {
      const calculated = calculateItemValue(item);
      numericAttributes.forEach(attr => {
        const value = attr.isCalculated ? calculated[attr.id] : item.values[attr.id];
        if (typeof value === 'number') {
          result[attr.id] += value;
        }
      });
    });

    return result;
  }, [filteredAndSortedItems, category, calculateItemValue]);
  
  // Funktion zum Öffnen externer Links
  const openExternalLink = (linkUrl: string) => {
    if (window.electronAPI) {
      window.electronAPI.openExternalURL(linkUrl);
    } else {
      // Fallback für Browser
      (window as Window).open(linkUrl, '_blank', 'noopener,noreferrer');
    }
  };
  
  return (
    <div className="space-y-6">
      {!category ? (
        <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md p-6">
          <div className="text-center">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100">
              Kategorie nicht gefunden
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Die ausgewählte Kategorie existiert nicht oder wird gerade geladen.
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => navigate('/')}
                className={primaryButtonClass}
              >
                Zurück zum Dashboard
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Header mit Titel und Aktionen */}
          <div className="bg-white dark:bg-gray-800 shadow">
            <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
              <h1 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100">
                {category.name}
              </h1>
              <div className="flex space-x-2 mt-4 sm:mt-0">
                {selectedItems.length > 0 && (
                  <button
                    onClick={() => setShowBulkEditModal(true)}
                    className={secondaryButtonClass}
                  >
                    <PencilIcon className="-ml-1 h-5 w-5" aria-hidden="true" />
                    {selectedItems.length} Bearbeiten
                  </button>
                )}
                {selectedItems.length > 0 && (
                  <button
                    onClick={handleDeleteSelectedItems}
                    className={dangerButtonClass}
                  >
                    <TrashIcon className="-ml-1 h-5 w-5" aria-hidden="true" />
                    {selectedItems.length} Löschen
                  </button>
                )}
                <button
                  onClick={handleAddItem}
                  className={primaryButtonClass}
                >
                  <PlusIcon className="-ml-1 h-5 w-5" aria-hidden="true" />
                  Hinzufügen
                </button>
              </div>
            </div>
          </div>
          
          {/* Such- und Filterleiste */}
          <div
            className={`mt-6 flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-4 ${
              items.length === 0 ? 'hidden' : 'flex'
            }`}
          >
            <div className="relative flex-grow">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
              </div>
              <input
                type="text"
                name="search"
                id="search"
                className={`${inputClass} h-10 pl-10`}
                aria-label="Einträge durchsuchen"
                placeholder="Suche…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            {filterableAttributes.length > 0 && (
              <div className="flex items-center space-x-2 sm:min-w-[200px]">
                <FunnelIcon className="h-5 w-5 text-gray-400 dark:text-gray-500 flex-shrink-0" aria-hidden="true" />
                <select
                  id="filter-attribute"
                  aria-label="Filtern nach"
                  className={`${selectClass} h-10`}
                  value={selectedFilter}
                  onChange={(e) => {
                    setSelectedFilter(e.target.value);
                    setFilterValue('');
                  }}
                >
                  <option value="">Filter auswählen</option>
                  {filterableAttributes.map((attr) => (
                    <option key={attr.id} value={attr.id}>
                      {attr.name}
                    </option>
                  ))}
                </select>
                
                {selectedFilter && (
                  <select
                    id="filter-value"
                    aria-label="Filterwert"
                    className={`${selectClass} h-10`}
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                  >
                    <option value="">Alle anzeigen</option>
                    {filterValues.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Sortierung — auch in der mobilen Kartenansicht nutzbar (die
                sortierbaren Tabellen-Header gibt es nur im Desktop-Layout).
                Teilt sich State mit den Spalten-Headern (sortBy/sortDirection). */}
            {visibleAttributes.length > 0 && (
              <div className="flex items-center space-x-2 sm:min-w-[200px]">
                <ArrowsUpDownIcon className="h-5 w-5 text-gray-400 dark:text-gray-500 flex-shrink-0" aria-hidden="true" />
                <select
                  id="sort-attribute"
                  aria-label="Sortieren nach"
                  className={`${selectClass} h-10`}
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  {visibleAttributes.map((attr) => (
                    <option key={attr.id} value={attr.id}>
                      {attr.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  title={sortDirection === 'asc' ? 'Aufsteigend' : 'Absteigend'}
                  aria-label={`Sortierrichtung: ${sortDirection === 'asc' ? 'aufsteigend' : 'absteigend'}`}
                  className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:text-pokemon-blue dark:hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-pokemon-blue"
                >
                  {sortDirection === 'asc' ? (
                    <BarsArrowUpIcon className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <BarsArrowDownIcon className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            )}

            {/* Umschalter Tabelle/Kacheln (#128) */}
            <div className="inline-flex flex-shrink-0 self-start rounded-md shadow-sm sm:self-auto" role="group" aria-label="Ansicht">
              {(
                [
                  { mode: 'table', label: 'Tabelle', icon: TableCellsIcon },
                  { mode: 'tiles', label: 'Kacheln', icon: Squares2X2Icon },
                ] as const
              ).map(({ mode, label, icon: Icon }, index) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => chooseViewMode(mode)}
                  aria-pressed={viewMode === mode}
                  aria-label={label}
                  title={label}
                  className={`flex h-10 w-10 items-center justify-center border focus:outline-none focus-visible:ring-2 focus-visible:ring-pokemon-blue ${
                    index === 0 ? 'rounded-l-md' : '-ml-px rounded-r-md'
                  } ${
                    viewMode === mode
                      ? 'z-10 border-pokemon-blue bg-pokemon-blue text-white'
                      : 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:text-pokemon-blue dark:hover:text-blue-300'
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          {items.length === 0 ? (
            // Leere Kategorie (#129): sagen, was hier hingehört, und den ersten Schritt anbieten.
            <EmptyState
              className="mt-6"
              icon={PlusIcon}
              title={`Noch keine Einträge in „${category.name}“`}
              actions={
                <>
                  <button type="button" onClick={handleAddItem} className={primaryButtonClass}>
                    <PlusIcon className="-ml-1 h-5 w-5" aria-hidden="true" />
                    Ersten Eintrag anlegen
                  </button>
                  {category.attributes?.some((a) => a.id === 'expansion') && (
                    <button type="button" onClick={() => navigate('/katalog')} className={secondaryButtonClass}>
                      <RectangleStackIcon className="-ml-1 h-5 w-5" aria-hidden="true" />
                      Aus dem Katalog übernehmen
                    </button>
                  )}
                </>
              }
            >
              Name, Kaufpreis und aktueller Wert reichen für den Anfang. Fotos, Links und weitere Angaben kannst du
              jederzeit ergänzen.
            </EmptyState>
          ) : filteredAndSortedItems.length === 0 ? (
            <EmptyState
              className="mt-6"
              icon={MagnifyingGlassIcon}
              title="Keine Treffer"
              actions={
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedFilter('');
                    setFilterValue('');
                  }}
                  className={secondaryButtonClass}
                >
                  Suche und Filter zurücksetzen
                </button>
              }
            >
              Zu deiner Suche oder deinem Filter passt keiner der {items.length} Einträge dieser Kategorie.
            </EmptyState>
          ) : viewMode === 'tiles' ? (
            <div className="mt-6">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm text-gray-600 dark:text-gray-300 tabular-nums">
                <p>
                  {filteredAndSortedItems.length} {filteredAndSortedItems.length === 1 ? 'Eintrag' : 'Einträge'}
                  {typeof sums.totalValue === 'number' && ` · Gesamtwert ${formatEur(sums.totalValue)}`}
                  {typeof sums.profitLoss === 'number' && (
                    <>
                      {' · Gewinn/Verlust '}
                      <span className={sums.profitLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                        {formatSignedEur(sums.profitLoss)}
                      </span>
                    </>
                  )}
                </p>
                <button type="button" onClick={toggleSelectAll} className="text-pokemon-blue dark:text-blue-300 hover:underline">
                  {selectedItems.length === filteredAndSortedItems.length ? 'Auswahl aufheben' : 'Alle auswählen'}
                </button>
              </div>
              <ItemTileGrid
                items={filteredAndSortedItems}
                calculateItemValue={calculateItemValue}
                selectedIds={selectedItems}
                onToggleSelect={toggleItemSelection}
                onOpen={handleEditItem}
                onOpenImages={openLightbox}
                highlightedItemId={highlightedItemId}
                highlightRef={highlightRef}
                portrait={category.attributes?.some((a) => a.id === 'expansion')}
              />
            </div>
          ) : (
          <>
          {/* Mobile Listenansicht (für kleine Bildschirme) */}
          <div className="md:hidden mt-6">
              <div className="bg-white dark:bg-gray-800 shadow overflow-hidden rounded-md">
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {!isDesktop && filteredAndSortedItems.map((item) => {
                    // Berechnete Werte
                    const calculatedValues = calculateItemValue(item);
                    
                    // Wichtige Attribute für die mobile Ansicht extrahieren
                    const nameAttr = visibleAttributes.find(attr => attr.id === 'name');
                    const name = nameAttr ? item.values[nameAttr.id] || 'Unbenannt' : 'Unbenannt';
                    
                    // Preisattribute suchen
                    const valueAttr = visibleAttributes.find(attr => attr.id === 'currentValue' || attr.id === 'totalValue');
                    const value = valueAttr && calculatedValues[valueAttr.id] !== undefined 
                      ? formatEur(Number(calculatedValues[valueAttr.id]))
                      : '';
                    
                    // Hauptbild (Vorderseite, sonst erstes) für die Vorschau (#1)
                    const mainImage = getPrimaryImage(item.images);
                    const hasImage = mainImage !== null;
                    
                    return (
                      <li
                        key={item.id}
                        ref={(el) => {
                          if (item.id === highlightedItemId) highlightRef.current = el;
                        }}
                        className={`px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-500 ${
                          item.id === highlightedItemId ? 'bg-yellow-100' : ''
                        }`}
                        onClick={() => handleEditItem(item)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center mb-1">
                            {hasImage && mainImage ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openLightbox(item); }}
                                className="mr-3 flex-shrink-0 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden"
                                title="Bilder ansehen"
                              >
                                <Thumbnail image={mainImage} alt={name} className="h-12 w-12 object-contain" />
                              </button>
                            ) : (
                              <div className="h-12 w-12 flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-md mr-3 border border-gray-200 dark:border-gray-700">
                                <PhotoIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                              </div>
                            )}
                            <div>
                              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{name}</h3>
                              {value && (
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
                                  Wert: {value}
                                </p>
                              )}
                            </div>
                          </div>
                          
                          {/* Mobile Attribut-Liste - Zeige nur wichtige Attribute */}
                          <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1">
                            {visibleAttributes.slice(0, 4).map((attr) => {
                              if (attr.id === 'name') return null; // Name wird bereits angezeigt
                              
                              const attrValue = attr.type === 'formula' 
                                ? calculatedValues[attr.id] 
                                : item.values[attr.id];
                              
                              if (attrValue === undefined || attrValue === null || attrValue === '') return null;
                              
                              let displayValue = attrValue;
                              
                              // Für Zahlen Formatierung mit €
                              if (attr.type === 'number' || attr.type === 'formula') {
                                if (typeof attrValue === 'number') {
                                  displayValue = formatAttributeNumber(attr.id, attrValue);
                                }
                              } else if (attr.type === 'boolean') {
                                displayValue = attrValue ? 'Ja' : 'Nein';
                              } else if (attr.type === 'date' && attrValue) {
                                displayValue = new Date(attrValue).toLocaleDateString('de-DE');
                              } else if (attr.id === 'language') {
                                // Formatierung der Sprache mit erstem Buchstaben groß
                                displayValue = attrValue ? attrValue.charAt(0).toUpperCase() + attrValue.slice(1) : '';
                              }
                              
                              // Gewinn/Verlust farblich hervorheben
                              let valueClass = 'text-gray-900 dark:text-gray-100';
                              if (attr.id === 'profitLoss') {
                                valueClass = attrValue >= 0 ? 'text-green-600' : 'text-red-600';
                              }
                              
                              return (
                                <div key={attr.id} className="flex flex-col">
                                  <span className="text-xs text-gray-500 dark:text-gray-400">{attr.name}</span>
                                  <span className={`text-xs ${valueClass} truncate`}>{displayValue}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        
                        <ChevronRightIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                      </li>
                    );
                  })}
                </ul>
              </div>
          </div>

          {/* Tabelle (für mittlere und große Bildschirme) */}
          <div className="hidden md:flex md:flex-col mt-6">
            <div className="-my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="py-2 align-middle inline-block min-w-full sm:px-6 lg:px-8">
                <div className="shadow overflow-hidden border-b border-gray-200 dark:border-gray-700 sm:rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        {/* Checkbox für "Alle auswählen" */}
                        <th scope="col" className="relative px-6 py-3 w-12">
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-pokemon-blue rounded"
                            checked={selectedItems.length === filteredAndSortedItems.length && filteredAndSortedItems.length > 0}
                            onChange={toggleSelectAll}
                            disabled={filteredAndSortedItems.length === 0}
                          />
                        </th>
                        {/* Spalte für Bilder */}
                        <th scope="col" className="relative px-3 py-3 w-10">
                          <span className="sr-only">Bild</span>
                        </th>
                        {visibleAttributes.map((attr) => (
                          <th
                            key={attr.id}
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                            onClick={() => handleSort(attr.id)}
                          >
                            <div className="flex items-center space-x-1">
                              <span>{attr.name}</span>
                              {sortBy === attr.id && (
                                <ArrowUpCircleIcon
                                  className={`h-4 w-4 ${sortDirection === 'desc' ? 'transform rotate-180' : ''}`}
                                />
                              )}
                            </div>
                          </th>
                        ))}
                        <th scope="col" className="relative px-6 py-3">
                          <span className="sr-only">Aktionen</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {isDesktop && filteredAndSortedItems.map((item) => {
                        // Berechnete Werte
                        const calculatedValues = calculateItemValue(item);
                        
                        return (
                          <tr
                            key={item.id}
                            ref={(el) => {
                              if (item.id === highlightedItemId) highlightRef.current = el;
                            }}
                            className={`transition-colors duration-500 ${
                              item.id === highlightedItemId
                                ? 'bg-yellow-100'
                                : selectedItems.includes(item.id)
                                ? 'bg-blue-50 dark:bg-gray-700'
                                : ''
                            }`}
                          >
                            {/* Checkbox für einzelne Zeile */}
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="checkbox"
                                className="h-4 w-4 text-pokemon-blue rounded"
                                checked={selectedItems.includes(item.id)}
                                onChange={() => toggleItemSelection(item.id)}
                              />
                            </td>
                            
                            {/* Bild-Zelle */}
                            <td className="px-3 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                {countImages(item.images) > 0 ? (
                                  <button
                                    onClick={() => openLightbox(item)}
                                    className="relative text-pokemon-blue dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 inline-flex items-center justify-center"
                                    title="Bilder ansehen"
                                    onMouseEnter={(e) => {
                                      // Position einmalig beim Betreten setzen.
                                      // Kein onMouseMove mehr: das löste pro
                                      // Mausbewegung einen Re-Render der ganzen
                                      // Tabelle aus (#67).
                                      setHoverImage(getPrimaryImage(item.images));
                                      setHoverPosition({
                                        x: e.clientX,
                                        y: e.clientY
                                      });
                                    }}
                                    onMouseLeave={() => {
                                      setHoverImage(null);
                                      setHoverPosition(null);
                                    }}
                                  >
                                    <PhotoIcon className="h-5 w-5" />
                                    {countImages(item.images) > 1 && (
                                      <span className="absolute -top-1.5 -right-2 bg-pokemon-blue text-white text-[10px] leading-none rounded-full px-1 py-0.5">
                                        {countImages(item.images)}
                                      </span>
                                    )}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleEditItem(item)}
                                    className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 inline-flex items-center justify-center"
                                    title="Bild hinzufügen"
                                  >
                                    <CameraIcon className="h-5 w-5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleEditItem(item)}
                                  className="text-pokemon-blue dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 ml-2 inline-flex items-center justify-center"
                                >
                                  <PencilIcon className="h-5 w-5" />
                                </button>
                              </div>
                            </td>
                            
                            {visibleAttributes.map((attr) => {
                              // Wert bestimmen (berechnet oder direkt)
                              const value = attr.isCalculated 
                                ? calculatedValues[attr.id]
                                : item.values[attr.id];
                                
                              // Wert formatieren
                              let displayValue = '';
                              
                              if (value === null || value === undefined) {
                                displayValue = '';
                              } else if (attr.type === 'number' || attr.type === 'formula') {
                                if (typeof value === 'number') {
                                  // Beträge in Euro, Anzahl ohne Nachkommastellen (deutsches Format)
                                  displayValue = formatAttributeNumber(attr.id, value);
                                } else {
                                  displayValue = String(value);
                                }
                              } else if (attr.type === 'boolean') {
                                displayValue = value ? 'Ja' : 'Nein';
                              } else if (attr.type === 'date' && value instanceof Date) {
                                displayValue = value.toLocaleDateString();
                              } else if (attr.type === 'dropdown') {
                                // Für Dropdown-Felder den Wert mit erstem Buchstaben groß anzeigen
                                displayValue = value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
                              } else {
                                displayValue = String(value);
                              }
                              
                              // CSS-Klassen für die Zelle
                              let cellClasses = 'px-6 py-4 whitespace-nowrap text-sm';
                              
                              // Für Name-Attribut fett anzeigen
                              if (attr.id === 'name') {
                                cellClasses += ' font-medium text-gray-900 dark:text-gray-100';
                              } else {
                                cellClasses += ' text-gray-500 dark:text-gray-400';
                              }
                              
                              // Gewinn/Verlust farblich hervorheben
                              if (attr.id === 'profitLoss' && typeof value === 'number') {
                                cellClasses += value >= 0 ? ' text-green-600' : ' text-red-600';
                              }
                              
                              // Stark vereinfachte Logik für Links
                              // 1. Check if name attribute has a link in the 'product' field
                              if (attr.id === 'name' && item?.links && item.links.product) {
                                const linkUrl = item.links.product;
                                return (
                                  <td key={attr.id} className={cellClasses}>
                                    <div className="flex items-center">
                                      <button 
                                        onClick={() => {
                                          logger.debug("Opening link:", linkUrl);
                                          openExternalLink(linkUrl);
                                        }}
                                        className="text-pokemon-blue dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 hover:underline flex items-center cursor-pointer"
                                      >
                                        {displayValue}
                                        <LinkIcon className="h-4 w-4 ml-1" />
                                      </button>
                                    </div>
                                  </td>
                                );
                              }
                              
                              // 2. Check if this specific attribute has a link
                              const hasDirectLink = item?.links && attr.id in item.links && Boolean(item.links[attr.id]);
                              if (hasDirectLink) {
                                const linkUrl = item.links?.[attr.id] || '';
                                
                                return (
                                  <td key={attr.id} className={cellClasses}>
                                    <div className="flex items-center">
                                      <button
                                        onClick={() => {
                                          logger.debug("Opening direct link:", linkUrl);
                                          openExternalLink(linkUrl);
                                        }}
                                        className="text-pokemon-blue dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 hover:underline flex items-center cursor-pointer"
                                      >
                                        {displayValue}
                                        <LinkIcon className="h-4 w-4 ml-1" />
                                      </button>
                                    </div>
                                  </td>
                                );
                              }
                              
                              return (
                                <td key={attr.id} className={cellClasses}>
                                  {displayValue}
                                </td>
                              );
                            })}
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id)}
                                title="Löschen"
                                aria-label={`${String(item.values?.name || 'Eintrag')} löschen`}
                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                              >
                                <TrashIcon className="h-5 w-5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      
                      {/* Summenzeile für numerische Spalten */}
                      {filteredAndSortedItems.length > 0 && (
                        <tr className="bg-gray-50 dark:bg-gray-700 font-medium">
                          {/* Leere Zelle für die Checkbox-Spalte */}
                          <td className="px-6 py-4 whitespace-nowrap"></td>
                          {/* Leere Zelle für die Bild- und Edit-Spalte */}
                          <td className="px-3 py-4 whitespace-nowrap text-center"></td>
                          
                          {visibleAttributes.map((attr, index) => {
                            // Für die erste Spalte "Summe" anzeigen
                            if (index === 0) {
                              return (
                                <td key={attr.id} className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-gray-100">
                                  Summe
                                </td>
                              );
                            }
                            
                            // Für numerische Spalten die Summe anzeigen
                            if ((attr.type === 'number' || attr.type === 'formula') && sums[attr.id]) {
                              let cellClasses = 'px-6 py-4 whitespace-nowrap text-sm font-bold';
                              
                              // Gewinn/Verlust farblich hervorheben
                              if (attr.id === 'profitLoss') {
                                cellClasses += sums[attr.id] >= 0 ? ' text-green-600' : ' text-red-600';
                              } else {
                                cellClasses += ' text-gray-900 dark:text-gray-100';
                              }
                              
                              return (
                                <td key={attr.id} className={cellClasses}>
                                  {formatAttributeNumber(attr.id, sums[attr.id])}
                                </td>
                              );
                            }
                            
                            // Für andere Spalten leere Zellen
                            return <td key={attr.id} className="px-6 py-4 whitespace-nowrap"></td>;
                          })}
                          <td className="px-6 py-4 whitespace-nowrap"></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          
          </>
          )}
          
          {/* Zoombarer Bild-Lightbox (#1) */}
          {lightbox && (
            <ImageLightbox
              images={lightbox.images}
              initialIndex={lightbox.index}
              onClose={() => setLightbox(null)}
            />
          )}
          
          {/* Hover-Bild — Position wird an den Viewport geklemmt, damit das
              Popup immer vollständig sichtbar ist. In der obersten Zeile würde
              es sonst nach oben aus dem Bild laufen; durch das Clampen öffnet
              es dann nach unten, horizontal weicht es bei Bedarf nach links aus. */}
          {hoverImage && hoverPosition && (() => {
            const SIZE = 200;   // Kantenlänge des Popups (w/h)
            const MARGIN = 8;   // Mindestabstand zum Fensterrand
            const GAP = 20;     // Abstand zum Cursor/Icon
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            // Bevorzugt rechts neben dem Cursor; wenn dort kein Platz ist, links.
            let left = hoverPosition.x + GAP;
            if (left + SIZE + MARGIN > vw) {
              left = hoverPosition.x - GAP - SIZE;
            }
            left = Math.max(MARGIN, Math.min(left, vw - SIZE - MARGIN));

            // Vertikal am Cursor zentriert, aber komplett im sichtbaren Bereich.
            let top = hoverPosition.y - SIZE / 2;
            top = Math.max(MARGIN, Math.min(top, vh - SIZE - MARGIN));

            return (
              <div
                className="fixed z-30 bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-xl border border-gray-200 dark:border-gray-700"
                style={{
                  left: `${left}px`,
                  top: `${top}px`,
                  width: `${SIZE}px`,
                  height: `${SIZE}px`,
                  pointerEvents: 'none' // Damit es die MouseEnter/Leave-Events nicht stört
                }}
              >
                <img
                  src={hoverImage}
                  alt="Vorschau"
                  className="w-full h-full object-contain"
                />
              </div>
            );
          })()}
          
          {/* Modal zum Hinzufügen/Bearbeiten von Items */}
          {showItemModal && category && (
            <ItemModal
              category={category}
              item={editingItem}
              onSave={(values, options) => {
                const itemId = handleSaveItem(values, options);
                setShowItemModal(false);
                return itemId;
              }}
              onCancel={() => setShowItemModal(false)}
            />
          )}

          {/* Modal zur Massenbearbeitung der ausgewählten Einträge */}
          {showBulkEditModal && category && selectedItems.length > 0 && (
            <BulkEditModal
              category={category}
              selectedCount={selectedItems.length}
              onApply={handleBulkEditApply}
              onCancel={() => setShowBulkEditModal(false)}
            />
          )}
        </>
      )}
    </div>
  );
};

export default CategoryItemsList;
