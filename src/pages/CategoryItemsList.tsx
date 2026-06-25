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
  XMarkIcon
} from '@heroicons/react/24/outline';
import { ChevronRightIcon } from '@heroicons/react/20/solid';
import { useCategoriesData, useItemsData, useCollectionActions } from '../context/CollectionContext';
import { useLoading } from '../context/LoadingContext';
import { CollectionItem, AttributeDefinition, AttributeDataType } from '../types/models';
import { logger } from '../utils/logger';
import { inputClass, selectClass } from '../utils/formStyles';
import {
  getOrderedImages,
  getPrimaryImage,
  countImages,
  createExtraImageKey,
  FRONT_IMAGE_KEY,
  BACK_IMAGE_KEY,
  ItemImage,
} from '../utils/itemImages';
import ImageLightbox from '../components/common/ImageLightbox';
import { parseDateInput } from '../utils/dateInput';

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
  } = useCollectionActions();
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

  // setIsSaving triggert Re-Renders während asynchroner Speicheroperationen,
  // der Wert selbst wird aktuell nirgends gerendert.
  const [, setIsSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning'
  }>({
    open: false,
    message: '',
    severity: 'success'
  });
  
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
  
  // Funktion zum Löschen eines Items
  const handleDeleteItem = (itemId: string) => {
    if (window.confirm('Bist du sicher, dass du diesen Eintrag löschen möchtest?')) {
      deleteItem(itemId);
      // Entferne das Item auch aus der Auswahl, wenn es ausgewählt war
      setSelectedItems(prev => prev.filter(id => id !== itemId));
    }
  };
  
  // Funktion zum Löschen mehrerer Items
  const handleDeleteSelectedItems = () => {
    if (selectedItems.length === 0) return;
    
    if (window.confirm(`Bist du sicher, dass du ${selectedItems.length} ausgewählte Einträge löschen möchtest?`)) {
      deleteMultipleItems(selectedItems);
      setSelectedItems([]); // Auswahl zurücksetzen
    }
  };

  // Wendet die in der Massenbearbeitung gesetzten Attribute auf alle
  // ausgewählten Einträge an.
  const handleBulkEditApply = (values: Record<string, any>) => {
    const count = selectedItems.length;
    if (count === 0 || Object.keys(values).length === 0) {
      setShowBulkEditModal(false);
      return;
    }
    updateMultipleItems(selectedItems, values);
    setShowBulkEditModal(false);
    setSelectedItems([]);
    showSnackbarMessage(`${count} Einträge aktualisiert`);
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
  
  const handleSaveItem = (values: Record<string, any>): string => {
    if (editingItem) {
      try {
        // Fortschrittsanzeige aktivieren
        setIsSaving(true);
        
        // Speichere das Item und melde die ID zurück
        updateItem(editingItem.id, values);
        
        // Schließe sofort nach dem Update das Modal, um Flackern zu vermeiden
        // Die Aktualisierung des Speicherzustands erfolgt asynchron
        setEditingItem(null);
        
        // Anzeigen einer Erfolgsmeldung
        showSnackbarMessage('Item erfolgreich aktualisiert');
        
        return editingItem.id;
      } catch (error) {
        console.error('Fehler beim Speichern des Items:', error);
        showSnackbarMessage('Fehler beim Speichern des Items', 'error');
        return '';
      } finally {
        // Fortschrittsanzeige deaktivieren
        setIsSaving(false);
      }
    } else {
      return addItem(categoryId || '', values);
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
    if ('electronAPI' in window) {
      window.electronAPI.openExternalURL(linkUrl);
    } else {
      // Fallback für Browser
      (window as Window).open(linkUrl, '_blank', 'noopener,noreferrer');
    }
  };
  
  // Hilfsfunktion für Benachrichtigungen
  const showSnackbarMessage = (
    message: string, 
    severity: 'success' | 'error' | 'info' | 'warning' = 'success'
  ) => {
    setSnackbar({
      open: true,
      message,
      severity
    });
    
    // Automatisches Schließen nach 3 Sekunden
    setTimeout(() => {
      setSnackbar(prev => ({ ...prev, open: false }));
    }, 3000);
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
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-pokemon-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pokemon-blue"
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
                    className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <PencilIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                    {selectedItems.length} Bearbeiten
                  </button>
                )}
                {selectedItems.length > 0 && (
                  <button
                    onClick={handleDeleteSelectedItems}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
                  >
                    <TrashIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                    {selectedItems.length} Löschen
                  </button>
                )}
                <button
                  onClick={handleAddItem}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-pokemon-blue hover:bg-blue-700"
                >
                  <PlusIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                  Hinzufügen
                </button>
              </div>
            </div>
          </div>
          
          {/* Such- und Filterleiste */}
          <div className="mt-6 flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-4">
            <div className="relative flex-grow">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
              </div>
              <input
                type="text"
                name="search"
                id="search"
                className="focus:outline-none focus:ring-2 focus:ring-pokemon-blue focus:border-pokemon-blue block w-full pl-10 py-2 sm:text-sm rounded-md h-10 border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="Suche..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            {filterableAttributes.length > 0 && (
              <div className="flex items-center space-x-2 sm:min-w-[200px]">
                <FunnelIcon className="h-5 w-5 text-gray-400 dark:text-gray-500 flex-shrink-0" aria-hidden="true" />
                <select
                  id="filter-attribute"
                  className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-700 border-2 bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-pokemon-blue focus:border-pokemon-blue sm:text-sm rounded-md h-10"
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
                    className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-700 border-2 bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-pokemon-blue focus:border-pokemon-blue sm:text-sm rounded-md"
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
                  className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-700 border-2 bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-pokemon-blue focus:border-pokemon-blue sm:text-sm rounded-md h-10"
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
                  className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-md border-2 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:text-pokemon-blue focus:outline-none focus:ring-pokemon-blue focus:border-pokemon-blue"
                >
                  {sortDirection === 'asc' ? (
                    <BarsArrowUpIcon className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <BarsArrowDownIcon className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            )}
          </div>
          
          {/* Mobile Listenansicht (für kleine Bildschirme) */}
          <div className="md:hidden mt-6">
            {filteredAndSortedItems.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400 text-lg">Keine Einträge gefunden.</p>
                <p className="text-gray-400 dark:text-gray-500 mt-2">Füge neue Einträge hinzu oder ändere deine Suchkriterien.</p>
              </div>
            ) : (
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
                      ? Number(calculatedValues[valueAttr.id]).toFixed(2) + ' €' 
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
                                <img
                                  src={mainImage}
                                  alt={name}
                                  className="h-12 w-12 object-contain"
                                />
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
                            {visibleAttributes.slice(0, 4).map((attr, index) => {
                              if (attr.id === 'name') return null; // Name wird bereits angezeigt
                              
                              const attrValue = attr.type === 'formula' 
                                ? calculatedValues[attr.id] 
                                : item.values[attr.id];
                              
                              if (attrValue === undefined || attrValue === null || attrValue === '') return null;
                              
                              let displayValue = attrValue;
                              
                              // Für Zahlen Formatierung mit €
                              if (attr.type === 'number' || attr.type === 'formula') {
                                if (typeof attrValue === 'number') {
                                  displayValue = attrValue.toFixed(2) + ' €';
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
            )}
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
                              let value = attr.isCalculated 
                                ? calculatedValues[attr.id]
                                : item.values[attr.id];
                                
                              // Wert formatieren
                              let displayValue = '';
                              
                              if (value === null || value === undefined) {
                                displayValue = '';
                              } else if (attr.type === 'number' || attr.type === 'formula') {
                                if (typeof value === 'number') {
                                  // Preise und Werte mit €-Symbol anzeigen
                                  if (attr.id.includes('price') || attr.id.includes('Price') || 
                                      attr.id.includes('value') || attr.id.includes('Value') || 
                                      attr.id.includes('cost') || attr.id.includes('Cost') ||
                                      attr.id === 'profitLoss') {
                                    displayValue = `${value.toFixed(2)} €`;
                                  } else {
                                    // Anzahl ohne Dezimalstellen
                                    displayValue = attr.id === 'quantity' ? 
                                      Math.round(value).toString() : 
                                      value.toFixed(2);
                                  }
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
                                onClick={() => handleDeleteItem(item.id)}
                                className="text-red-600 hover:text-red-900"
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
                                  {attr.id.includes('price') || attr.id.includes('Price') || 
                                  attr.id.includes('value') || attr.id.includes('Value') || 
                                  attr.id.includes('cost') || attr.id.includes('Cost') || 
                                  attr.id === 'profitLoss' ? 
                                  `${sums[attr.id].toFixed(2)} €` : 
                                  (attr.id === 'quantity' ? Math.round(sums[attr.id]) : sums[attr.id].toFixed(2))}
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
          
          {/* Keine Daten Hinweis für Desktop-Ansicht */}
          {filteredAndSortedItems.length === 0 && (
            <div className="hidden md:block text-center py-12">
              <p className="text-gray-500 dark:text-gray-400 text-lg">Keine Einträge gefunden.</p>
              <p className="text-gray-400 dark:text-gray-500 mt-2">Füge neue Einträge hinzu oder ändere deine Suchkriterien.</p>
            </div>
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
              onSave={(values) => {
                const itemId = handleSaveItem(values);
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

          {/* Eigene Benachrichtigungskomponente */}
          {snackbar.open && (
            <div 
              className={`fixed bottom-4 right-4 p-4 rounded-md shadow-lg transition-opacity duration-300 z-50 
                ${snackbar.severity === 'success' ? 'bg-green-600 text-white' : 
                  snackbar.severity === 'error' ? 'bg-red-600 text-white' : 
                  snackbar.severity === 'warning' ? 'bg-yellow-600 text-white' : 
                  'bg-blue-600 text-white'}`}
            >
              <div className="flex items-center space-x-2">
                {snackbar.severity === 'success' && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {snackbar.severity === 'error' && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                {snackbar.severity === 'warning' && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
                {snackbar.severity === 'info' && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span>{snackbar.message}</span>
                <button 
                  onClick={() => setSnackbar(prev => ({ ...prev, open: false }))}
                  className="ml-auto focus:outline-none"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Modal-Komponente für das Hinzufügen/Bearbeiten von Items
interface ItemModalProps {
  category: {
    id: string;
    name: string;
    attributes: AttributeDefinition[];
  };
  item: CollectionItem | null;
  onSave: (values: Record<string, any>) => string;
  onCancel: () => void;
}

const ItemModal: React.FC<ItemModalProps> = ({ category, item, onSave, onCancel }) => {
  // Re-Render-Isolation (#18): Items-Slice + (stabile) Actions gezielt.
  const { addImageToItem, removeImageFromItem, addLinkToItem, removeLinkFromItem } = useCollectionActions();
  const items = useItemsData();
  
  // Loading-Indikator Hook
  const { showLoading, hideLoading } = useLoading();
  
  // Attribute für das Formular aufbereiten (sortiert und ohne berechnete Felder)
  const editableAttributes = useMemo(() => {
    if (!category || !category.attributes) return [];
    return category.attributes
      .filter(attr => !attr.isCalculated)
      .sort((a, b) => a.order - b.order);
  }, [category]);
  
  // State für Link-Dialog
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkDialogDefaultValue, setLinkDialogDefaultValue] = useState('');
  const [currentLinkAttributeId, setCurrentLinkAttributeId] = useState<string | null>(null);
  const [linkInputValue, setLinkInputValue] = useState('');
  const [itemLinks, setItemLinks] = useState<Record<string, string>>({});

  // Ref für das Hauptmodal-Element und File input
  const modalRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkDialogRef = useRef<HTMLDivElement>(null);
  // Merkt sich, in welchen Bild-Slot der nächste Datei-Upload geschrieben wird
  // (Vorderseite/Rückseite/Extra). Ein gemeinsames verstecktes File-Input.
  const uploadKeyRef = useRef<string>(FRONT_IMAGE_KEY);
  // Lokaler Lightbox-Zustand des Bearbeiten-Dialogs (#1)
  const [modalLightbox, setModalLightbox] = useState<{ images: ItemImage[]; index: number } | null>(null);

  // Initialisiere Formularwerte aus dem Item oder mit Standardwerten
  const initialValues = useMemo(() => {
    const values: Record<string, any> = {};
    
    // Debugging: Ausgabe der aktuellen Item-Werte
    logger.debug('Item für Formularinitialisierung:', item?.id, item?.values);
    
    editableAttributes.forEach(attr => {
      if (item && item.values[attr.id] !== undefined) {
        // Für alle Feldtypen den Wert direkt übernehmen
        values[attr.id] = item.values[attr.id];
      } else {
        // Standardwerte je nach Typ
        switch (attr.type) {
          case 'number':
            values[attr.id] = 0;
            break;
          case 'boolean':
            values[attr.id] = false;
            break;
          case 'date':
            // "Gekauft am" (#45) bei NEUEN Items mit heute vorbelegen
            // (lokales Datum als YYYY-MM-DD, passend zum <input type="date">).
            if (!item && attr.id === 'addedDate') {
              const t = new Date();
              values[attr.id] = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
            } else {
              values[attr.id] = null;
            }
            break;
          case 'dropdown':
            values[attr.id] = ''; // Leerer String für Dropdown-Felder
            break;
          default:
            values[attr.id] = '';
        }
      }
    });
    
    logger.debug('Initialisierte Formularwerte:', values);
    return values;
  }, [item, editableAttributes]);
  
  const [formValues, setFormValues] = useState(initialValues);
  const [newImages, setNewImages] = useState<{[key: string]: string}>({});
  
  // Aktualisiere Formularwerte, wenn sich item ändert
  useEffect(() => {
    logger.debug('Item hat sich geändert, aktualisiere Formularwerte');
    setFormValues(initialValues);
  }, [initialValues, item]);
  
  // Initialisiere Links-Zustand wenn sich das Item ändert
  useEffect(() => {
    if (item && item.links) {
      logger.debug('Initialisiere Links aus Item:', item.links);
      // Deep copy um sicherzustellen, dass wir eine neue Referenz haben
      setItemLinks({...item.links});
    } else {
      setItemLinks({});
    }
  }, [item]);
  
  // Regelmäßiges Aktualisieren des Link-States aus dem Context
  useEffect(() => {
    if (item && items) {
      // Das Item aus den aktuellen Items holen, um immer die neueste Version zu haben
      const currentItem = items.find(i => i.id === item.id);
      if (currentItem && currentItem.links) {
        // UI nur aktualisieren, wenn sich die Links tatsächlich geändert haben
        // Verwenden einer Deep-Comparison, um zu prüfen, ob sich etwas geändert hat
        const linksChanged = JSON.stringify(currentItem.links) !== JSON.stringify(itemLinks);
        if (linksChanged) {
          logger.debug('Links haben sich geändert, aktualisiere UI:', currentItem.links);
          setItemLinks({...currentItem.links});
        }
      }
    }
  }, [item, items, itemLinks]);

  // Handling für Wertänderungen
  const handleChange = (
    attributeId: string, 
    value: any, 
    type: AttributeDataType
  ) => {
    // Werte je nach Typ konvertieren
    let processedValue = value;

    // Zahlen: den Roh-String während der Eingabe NICHT sofort parsen. Sonst
    // erzwingt das frühere "'' -> 0" beim Löschen eine 0, an die beim Tippen
    // vorne angehängt wird (z.B. "050"). Stattdessen bleibt der Rohwert stehen
    // (leeres Feld erlaubt, Dezimaleingaben zuverlässig) und wird erst beim
    // Speichern in eine echte Zahl gewandelt (siehe handleSubmit).
    if (type === 'boolean' && typeof value === 'string') {
      processedValue = value === 'true';
    }

    setFormValues(prev => ({
      ...prev,
      [attributeId]: processedValue
    }));
  };
  
  // Öffnet den Datei-Dialog für einen bestimmten Bild-Slot (#1). Der Ziel-Slot
  // wird gemerkt, damit ein einziges verstecktes File-Input genügt.
  const pickImage = (key: string) => {
    uploadKeyRef.current = key;
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // dieselbe Datei erneut wählbar machen
      fileInputRef.current.click();
    }
  };

  // Funktion zum Hochladen von Bildern in den gemerkten Slot.
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const key = uploadKeyRef.current;
    const file = event.target.files?.[0];
    if (!file || !key) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const data = reader.result as string;
        setNewImages(prev => ({ ...prev, [key]: data }));
        // Bei bestehenden Items das Bild sofort persistieren.
        if (item) {
          addImageToItem(item.id, key, data);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // Entfernt ein Bild aus einem Slot (lokal und – bei bestehenden Items – sofort
  // im Speicher).
  const removeImage = (key: string) => {
    setNewImages(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (item) {
      removeImageFromItem(item.id, key);
    }
  };
  
  // Öffne Link-Dialog mit vorausgefülltem Wert
  const openLinkDialog = (attributeId: string) => {
    setCurrentLinkAttributeId(attributeId);
    
    if (item) {
      // Verwende den aktuellsten Link-Wert aus dem Context ohne cleanup
      const updatedItem = items.find(i => i.id === item.id);
      let currentLinkValue = '';
      
      if (updatedItem?.links?.[attributeId]) {
        currentLinkValue = updatedItem.links[attributeId];
      } else if (itemLinks[attributeId]) {
        // Fallback auf den lokalen State
        currentLinkValue = itemLinks[attributeId];
      }
      
      logger.debug(`Öffne Link-Dialog für ${attributeId}, aktueller Wert:`, currentLinkValue);
      
      setLinkDialogDefaultValue(currentLinkValue);
      setLinkInputValue(currentLinkValue);
      setShowLinkDialog(true);
    } else {
      // Für neue Items - lokalen State verwenden
      const currentLinkValue = itemLinks[attributeId] || '';
      setLinkDialogDefaultValue(currentLinkValue);
      setLinkInputValue(currentLinkValue);
      setShowLinkDialog(true);
    }
  };
  
  // Optimierte handleSubmit-Funktion:
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Zeige Loading-Indikator für die Operation
    showLoading('Änderungen werden gespeichert...');
    
    // Für Debugging
    logger.debug('Submitting form values:', formValues);

    // Zahlenfelder werden während der Eingabe als Roh-String gehalten — hier in
    // echte Zahlen wandeln (leer/ungültig -> 0), damit gespeicherte Werte und
    // Berechnungen/Summen korrekt numerisch sind.
    const valuesToSave: Record<string, any> = { ...formValues };
    editableAttributes.forEach(attr => {
      if (attr.type === 'number') {
        const raw = valuesToSave[attr.id];
        const n = typeof raw === 'number' ? raw : parseFloat(raw);
        valuesToSave[attr.id] = Number.isFinite(n) ? n : 0;
      }
    });

    // Speichern des Items
    const itemId = onSave(valuesToSave);
    
    // Debugging: Prüfen ob ID zurückgegeben wurde
    logger.debug('Saved item ID:', itemId);
    
    // Separat Bilder und Links hinzufügen, wenn vorhanden
    if (item || itemId) {
      const targetItemId = item ? item.id : itemId;
      
      // Für Debugging
      logger.debug('Target item ID for media:', targetItemId);
      
      // Bilder hinzufügen
      Object.entries(newImages).forEach(([attributeId, imageData]) => {
        logger.debug('Adding image for attribute:', attributeId);
        addImageToItem(targetItemId, attributeId, imageData);
      });
      
      // Links hinzufügen - optimiert ohne cleanup
      logger.debug('Links zum Speichern:', itemLinks);
      
      Object.entries(itemLinks).forEach(([attributeId, url]) => {
        if (url) {
          logger.debug('Adding link for attribute:', attributeId, url);
          addLinkToItem(targetItemId, attributeId, url);
        }
      });
      
      // Loading-Indikator ausblenden und Dialog schließen
      setTimeout(() => {
        hideLoading();
        onCancel();
      }, 300);
    } else {
      // Loading-Indikator ausblenden
      hideLoading();
      console.warn('No valid item ID for adding media');
      onCancel();
    }
  };
  
  // Bei Link-Dialog-Abbruch
  const cancelLinkDialog = () => {
    setShowLinkDialog(false);
    setLinkInputValue('');
    setCurrentLinkAttributeId(null);
  };
  
  // Funktion zum Erkennen von Klicks außerhalb des Modals
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    // Wenn Link-Dialog geöffnet ist, ignoriere Klicks außerhalb
    if (showLinkDialog) {
      return;
    }
    
    // Prüfe, ob der Klick außerhalb des Modals war
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onCancel();
    }
  }, [onCancel, showLinkDialog]);
  
  // Event-Listener für Klicks außerhalb des Modals hinzufügen/entfernen
  useEffect(() => {
    // Verzögerung hinzufügen, damit der Modal nicht sofort beim Öffnen schließt
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleOutsideClick);
    }, 200);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [handleOutsideClick]);
  
  // Optimierte handleLinkDialogSubmit-Funktion:
  const handleLinkDialogSubmit = () => {
    if (!currentLinkAttributeId) return;
    
    // Zeige Loading-Indikator an, während Link gespeichert wird
    showLoading('Link wird gespeichert...');
    
    const trimmedLink = linkInputValue.trim();
    
    if (item) {
      // Fall 1: Bestehendes Item - direkt den Link hinzufügen/entfernen
      if (trimmedLink === '') {
        // Entferne den Link
        removeLinkFromItem(item.id, currentLinkAttributeId);
        // Lokale Kopie aktualisieren
        const newLinks = {...itemLinks};
        delete newLinks[currentLinkAttributeId];
        setItemLinks(newLinks);
      } else {
        // Füge den Link hinzu oder aktualisiere ihn
        logger.debug('Füge Link hinzu:', currentLinkAttributeId, trimmedLink);
        // Lokale Kopie sofort aktualisieren, um UI-Flackern zu vermeiden
        setItemLinks(prev => ({
          ...prev,
          [currentLinkAttributeId]: trimmedLink
        }));
        // Dann erst den Context-Call ausführen
        addLinkToItem(item.id, currentLinkAttributeId, trimmedLink);
      }
    } else {
      // Fall 2: Neues Item - nur den lokalen State aktualisieren
      if (trimmedLink === '') {
        // Entferne den Link aus dem lokalen State
        const newLinks = {...itemLinks};
        delete newLinks[currentLinkAttributeId];
        setItemLinks(newLinks);
      } else {
        // Füge den Link zum lokalen State hinzu
        logger.debug('Füge Link zum lokalen State hinzu:', currentLinkAttributeId, trimmedLink);
        setItemLinks(prev => ({
          ...prev,
          [currentLinkAttributeId]: trimmedLink
        }));
      }
    }
    
    // Dialog schließen
    setShowLinkDialog(false);
    setLinkInputValue('');
    setCurrentLinkAttributeId(null);
    
    // Verstecke den Loading-Indikator nach kurzer Zeit
    setTimeout(() => {
      hideLoading();
    }, 300);
  };

  // Anzuzeigende Bilder (#1): aktuellster Item-Stand aus dem Context (frische
  // Bilder nach sofortigem Speichern) überlagert mit den lokal gewählten
  // Bildern. So sehen Vorschau/Lightbox immer den neuesten Stand.
  const liveItem = item ? items.find(i => i.id === item.id) : null;
  const displayImages: Record<string, string> = {
    ...(liveItem?.images || item?.images || {}),
    ...newImages,
  };
  const orderedDisplayImages = getOrderedImages(displayImages);
  const extraImages = orderedDisplayImages.filter(
    img => img.key !== FRONT_IMAGE_KEY && img.key !== BACK_IMAGE_KEY
  );

  // Öffnet den Lightbox des Dialogs ab einem bestimmten Slot.
  const openModalLightbox = (key: string) => {
    if (orderedDisplayImages.length === 0) return;
    const start = orderedDisplayImages.findIndex(img => img.key === key);
    setModalLightbox({ images: orderedDisplayImages, index: start >= 0 ? start : 0 });
  };

  // Ein einzelner Bild-Slot (Vorderseite/Rückseite/Extra) in der Medien-Sektion.
  const renderImageSlot = (key: string, label: string) => {
    const data = displayImages[key];
    return (
      <div key={key} className="flex flex-col items-center">
        <span className="text-xs text-gray-600 dark:text-gray-300 mb-1">{label}</span>
        <div className="relative w-24 h-24 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-900">
          {data ? (
            <>
              <button
                type="button"
                onClick={() => openModalLightbox(key)}
                className="w-full h-full flex items-center justify-center cursor-zoom-in"
                title="Bild vergrößern"
              >
                <img src={data} alt={label} className="max-w-full max-h-full object-contain" />
              </button>
              <button
                type="button"
                onClick={() => removeImage(key)}
                className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80"
                title="Bild entfernen"
                aria-label={`${label} entfernen`}
              >
                <XMarkIcon className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => pickImage(key)}
              className="w-full h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 hover:text-pokemon-blue"
              title={`${label} hinzufügen`}
            >
              <CameraIcon className="h-7 w-7" />
            </button>
          )}
        </div>
        {data && (
          <button
            type="button"
            onClick={() => pickImage(key)}
            className="mt-1 text-xs text-pokemon-blue dark:text-blue-400 hover:underline"
          >
            Ändern
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="fixed z-10 inset-0 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div 
          ref={modalRef} 
          className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full"
        >
          <form onSubmit={handleSubmit}>
            <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100">
                    {item ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}
                  </h3>
                  
                  {/* Bild-Upload (Vorder-/Rückseite + Extras) und Link-Bereich (#1) */}
                  <div className="mt-4 border-b border-gray-200 dark:border-gray-700 pb-4">
                    <div className="flex justify-between mb-2">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-200">Medien und Links</h4>
                    </div>

                    {/* Bilder */}
                    <div className="mb-4">
                      <h5 className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2 text-left">Bilder</h5>
                      <div className="flex flex-wrap gap-4 items-start">
                        {renderImageSlot(FRONT_IMAGE_KEY, 'Vorderseite')}
                        {renderImageSlot(BACK_IMAGE_KEY, 'Rückseite')}
                        {extraImages.map((img, i) => renderImageSlot(img.key, `Foto ${i + 1}`))}

                        {/* Weiteres Foto hinzufügen */}
                        <div className="flex flex-col items-center">
                          <span className="text-xs mb-1 invisible">+</span>
                          <button
                            type="button"
                            onClick={() => pickImage(createExtraImageKey())}
                            className="w-24 h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 hover:text-pokemon-blue hover:border-pokemon-blue"
                            title="Weiteres Foto hinzufügen"
                          >
                            <PlusIcon className="h-6 w-6" />
                            <span className="text-xs mt-1">Foto</span>
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-left">
                        JPG, PNG oder GIF. Klick auf ein Bild öffnet die Zoom-Ansicht.
                      </p>
                      {/* Gemeinsames verstecktes File-Input für alle Slots */}
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleImageUpload}
                      />
                    </div>

                    {/* Link Bereich */}
                    <div>
                      <h5 className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2 text-left">Link zum Produkt</h5>
                      <div className="flex flex-col space-y-2 items-start">
                        {itemLinks['product'] ? (
                          <button
                            type="button"
                            onClick={() => openLinkDialog('product')}
                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-pokemon-blue dark:text-blue-400 bg-blue-50 dark:bg-gray-700 hover:text-blue-900 dark:hover:text-blue-300"
                          >
                            <LinkIcon className="h-4 w-4 mr-2" />
                            <span>Link bearbeiten</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openLinkDialog('product')}
                            className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-700 text-sm leading-4 font-medium rounded-md text-pokemon-blue dark:text-blue-400 bg-gray-50 dark:bg-gray-700 hover:text-blue-900 dark:hover:text-blue-300"
                          >
                            <LinkIcon className="h-4 w-4 mr-2" />
                            <span>Link hinzufügen</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 space-y-4">
                    {editableAttributes.map((attr) => (
                      <div key={attr.id}>
                        <div className="flex justify-between">
                          <label htmlFor={attr.id} className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                            {attr.name}
                            {attr.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                        </div>
                        
                        {attr.type === 'text' && (
                          <input
                            type="text"
                            id={attr.id}
                            value={formValues[attr.id] || ''}
                            onChange={(e) => handleChange(attr.id, e.target.value, attr.type)}
                            required={attr.required}
                            className={`mt-1 ${inputClass}`}
                          />
                        )}
                        
                        {attr.type === 'number' && (
                          <input
                            type="number"
                            id={attr.id}
                            value={formValues[attr.id] ?? ''}
                            onChange={(e) => handleChange(attr.id, e.target.value, attr.type)}
                            required={attr.required}
                            step={attr.id === 'quantity' ? "1" : "0.01"}
                            min={attr.id === 'quantity' ? "0" : undefined}
                            className={`mt-1 ${inputClass}`}
                            onFocus={(e) => e.target.select()}
                            placeholder={attr.id.includes('price') || attr.id.includes('Value') ? "0.00 €" : "0"}
                          />
                        )}
                        
                        {attr.type === 'boolean' && (
                          <select
                            id={attr.id}
                            value={formValues[attr.id] ? 'true' : 'false'}
                            onChange={(e) => handleChange(attr.id, e.target.value, attr.type)}
                            required={attr.required}
                            className={`mt-1 ${selectClass}`}
                          >
                            <option value="true">Ja</option>
                            <option value="false">Nein</option>
                          </select>
                        )}
                        
                        {attr.type === 'date' && (
                          <input
                            type="date"
                            id={attr.id}
                            value={formValues[attr.id] || ''}
                            onChange={(e) => handleChange(attr.id, e.target.value, attr.type)}
                            onPaste={(e) => {
                              // Eingefügtes Datum (z.B. "25.06.2026") erkennen und
                              // ins ISO-Format übernehmen — zusätzlich zur
                              // normalen Auswahl/Eingabe.
                              const iso = parseDateInput(e.clipboardData.getData('text'));
                              if (iso) {
                                e.preventDefault();
                                handleChange(attr.id, iso, attr.type);
                              }
                            }}
                            required={attr.required}
                            className={`mt-1 ${inputClass}`}
                          />
                        )}
                        
                        {attr.type === 'dropdown' && (
                          <select
                            id={attr.id}
                            value={formValues[attr.id] || ''}
                            onChange={(e) => handleChange(attr.id, e.target.value, attr.type)}
                            required={attr.required}
                            className={`mt-1 ${selectClass}`}
                          >
                            <option value="">Bitte wählen</option>
                            {attr.options?.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-pokemon-blue text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pokemon-blue sm:ml-3 sm:w-auto sm:text-sm"
              >
                Speichern
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-700 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      </div>
      
      {/* Link Dialog */}
      {showLinkDialog && (
        <div className="fixed z-20 inset-0 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center">
            <div 
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
            ></div>
            
            <div 
              ref={linkDialogRef}
              className="relative bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:max-w-lg sm:w-full"
            >
              <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100 mb-4">
                  Link hinzufügen
                </h3>
                <div>
                  <label htmlFor="linkUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    CardMarket URL
                  </label>
                  <input
                    type="url"
                    id="linkUrl"
                    className={inputClass}
                    value={linkInputValue}
                    onChange={(e) => setLinkInputValue(e.target.value)}
                    placeholder="https://www.cardmarket.com/..."
                    autoFocus
                    onFocus={(e) => {
                      // Set default value when dialog opens and select it for easy replacement
                      if (linkInputValue === '' && linkDialogDefaultValue !== '') {
                        setLinkInputValue(linkDialogDefaultValue);
                        e.target.select();
                      }
                    }}
                    onKeyDown={(e) => {
                      // Absenden des Formulars bei Enter-Taste
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleLinkDialogSubmit();
                      }
                    }}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {linkDialogDefaultValue 
                      ? 'Lassen Sie das Feld leer, um den Link zu entfernen' 
                      : 'Geben Sie die vollständige URL ein (mit https://)'}
                  </p>
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-pokemon-blue text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pokemon-blue sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={handleLinkDialogSubmit}
                >
                  Speichern
                </button>
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-700 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={cancelLinkDialog}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Zoombarer Bild-Lightbox im Bearbeiten-Dialog (#1) */}
      {modalLightbox && (
        <ImageLightbox
          images={modalLightbox.images}
          initialIndex={modalLightbox.index}
          onClose={() => setModalLightbox(null)}
        />
      )}
    </div>
  );
};

// Modal zur Massenbearbeitung: setzt ausgewählte Attribute auf einen
// gemeinsamen Wert für alle markierten Einträge. Pro Attribut entscheidet ein
// Häkchen, ob es überhaupt geändert wird — nicht angehakte Attribute bleiben
// je Eintrag unangetastet.
interface BulkEditModalProps {
  category: {
    id: string;
    name: string;
    attributes: AttributeDefinition[];
  };
  selectedCount: number;
  onApply: (values: Record<string, any>) => void;
  onCancel: () => void;
}

const BulkEditModal: React.FC<BulkEditModalProps> = ({
  category,
  selectedCount,
  onApply,
  onCancel,
}) => {
  // Bearbeitbare Attribute: ohne berechnete Felder und ohne "Name"
  // (ein gemeinsamer Name für viele Einträge ergibt keinen Sinn).
  const editableAttributes = useMemo(() => {
    if (!category?.attributes) return [];
    return category.attributes
      .filter(attr => !attr.isCalculated && attr.id !== 'name')
      .sort((a, b) => a.order - b.order);
  }, [category]);

  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, any>>({});

  const defaultValueFor = (attr: AttributeDefinition): any => {
    // Zahlen starten leer (nicht 0), damit kein erzwungenes "0" stehen bleibt;
    // beim Anwenden wird leer zu 0 gewandelt.
    switch (attr.type) {
      case 'boolean':
        return false;
      default:
        return '';
    }
  };

  const toggleAttr = (attr: AttributeDefinition) => {
    setEnabled(prev => ({ ...prev, [attr.id]: !prev[attr.id] }));
    setValues(prev =>
      prev[attr.id] === undefined ? { ...prev, [attr.id]: defaultValueFor(attr) } : prev
    );
  };

  const handleValueChange = (attr: AttributeDefinition, raw: any) => {
    let value = raw;
    // Zahlen: Roh-String behalten (leer erlaubt, Dezimaleingaben zuverlässig);
    // erst beim Anwenden in eine echte Zahl wandeln.
    if (attr.type === 'boolean') {
      value = raw === 'true';
    }
    setValues(prev => ({ ...prev, [attr.id]: value }));
  };

  const enabledCount = editableAttributes.filter(attr => enabled[attr.id]).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, any> = {};
    editableAttributes.forEach(attr => {
      if (enabled[attr.id]) {
        let value = values[attr.id] ?? defaultValueFor(attr);
        if (attr.type === 'number') {
          const n = typeof value === 'number' ? value : parseFloat(value);
          value = Number.isFinite(n) ? n : 0;
        }
        payload[attr.id] = value;
      }
    });
    onApply(payload);
  };

  return (
    <div className="fixed z-10 inset-0 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true" onClick={onCancel}>
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <form onSubmit={handleSubmit}>
            <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100">
                {selectedCount} Einträge bearbeiten
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Hake die Attribute an, die du für alle ausgewählten Einträge gemeinsam setzen möchtest. Nicht angehakte Felder bleiben unverändert.
              </p>

              <div className="mt-4 space-y-3 max-h-[55vh] overflow-y-auto">
                {editableAttributes.map(attr => {
                  const isOn = !!enabled[attr.id];
                  return (
                    <div key={attr.id} className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id={`bulk-enable-${attr.id}`}
                        checked={isOn}
                        onChange={() => toggleAttr(attr)}
                        className="mt-2 h-4 w-4 text-pokemon-blue rounded flex-shrink-0"
                      />
                      <div className={`flex-1 ${isOn ? '' : 'opacity-50'}`}>
                        <label
                          htmlFor={`bulk-enable-${attr.id}`}
                          className="block text-sm font-medium text-gray-700 dark:text-gray-200"
                        >
                          {attr.name}
                        </label>

                        {attr.type === 'text' && (
                          <input
                            type="text"
                            value={values[attr.id] ?? ''}
                            onChange={(e) => handleValueChange(attr, e.target.value)}
                            disabled={!isOn}
                            className={`mt-1 ${inputClass}`}
                          />
                        )}

                        {attr.type === 'number' && (
                          <input
                            type="number"
                            value={values[attr.id] ?? ''}
                            onChange={(e) => handleValueChange(attr, e.target.value)}
                            disabled={!isOn}
                            step={attr.id === 'quantity' ? '1' : '0.01'}
                            min={attr.id === 'quantity' ? '0' : undefined}
                            className={`mt-1 ${inputClass}`}
                            onFocus={(e) => e.target.select()}
                          />
                        )}

                        {attr.type === 'date' && (
                          <input
                            type="date"
                            value={values[attr.id] ?? ''}
                            onChange={(e) => handleValueChange(attr, e.target.value)}
                            onPaste={(e) => {
                              const iso = parseDateInput(e.clipboardData.getData('text'));
                              if (iso) {
                                e.preventDefault();
                                handleValueChange(attr, iso);
                              }
                            }}
                            disabled={!isOn}
                            className={`mt-1 ${inputClass}`}
                          />
                        )}

                        {attr.type === 'boolean' && (
                          <select
                            value={values[attr.id] ? 'true' : 'false'}
                            onChange={(e) => handleValueChange(attr, e.target.value)}
                            disabled={!isOn}
                            className={`mt-1 ${selectClass}`}
                          >
                            <option value="true">Ja</option>
                            <option value="false">Nein</option>
                          </select>
                        )}

                        {attr.type === 'dropdown' && (
                          <select
                            value={values[attr.id] ?? ''}
                            onChange={(e) => handleValueChange(attr, e.target.value)}
                            disabled={!isOn}
                            className={`mt-1 ${selectClass}`}
                          >
                            <option value="">Bitte wählen</option>
                            {attr.options?.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                disabled={enabledCount === 0}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-pokemon-blue text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pokemon-blue disabled:opacity-40 disabled:cursor-not-allowed sm:ml-3 sm:w-auto sm:text-sm"
              >
                Auf {selectedCount} Einträge anwenden
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-700 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CategoryItemsList;