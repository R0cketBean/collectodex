import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { PlusIcon, CameraIcon, LinkIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useItemsData, useCollectionActions } from '../../context/CollectionContext';
import { CollectionItem, AttributeDefinition, AttributeDataType } from '../../types/models';
import { logger } from '../../utils/logger';
import { inputClass, selectClass } from '../../utils/formStyles';
import { getOrderedImages, createExtraImageKey, FRONT_IMAGE_KEY, BACK_IMAGE_KEY, ItemImage } from '../../utils/itemImages';
import ImageLightbox from '../common/ImageLightbox';
import { parseDateInput } from '../../utils/dateInput';
import { prepareImageFile, storeImage } from '../../utils/imageStorage';
import { normalizeLinkUrl } from '../../utils/itemLinks';

// Modal-Komponente für das Hinzufügen/Bearbeiten von Items
interface ItemModalProps {
  category: {
    id: string;
    name: string;
    attributes: AttributeDefinition[];
  };
  item: CollectionItem | null;
  onSave: (
    values: Record<string, any>,
    options?: {
      links?: { [attributeId: string]: string };
      images?: { [attributeId: string]: string };
    }
  ) => string;
  onCancel: () => void;
}

const ItemModal: React.FC<ItemModalProps> = ({ category, item, onSave, onCancel }) => {
  // Re-Render-Isolation (#18): Items-Slice + (stabile) Actions gezielt.
  const { addImageToItem, removeImageFromItem, addLinkToItem, removeLinkFromItem } = useCollectionActions();
  const items = useItemsData();
  
  // Loading-Indikator Hook
  
  // Attribute für das Formular aufbereiten (sortiert und ohne berechnete Felder)
  const editableAttributes = useMemo(() => {
    if (!category || !category.attributes) return [];
    return category.attributes
      .filter(attr => !attr.isCalculated)
      .sort((a, b) => a.order - b.order);
  }, [category]);

  // Autovervollständigung für Freitext-Felder (z. B. "Erweiterung"): sammelt
  // je Text-Attribut die bereits in dieser Kategorie erfassten Werte und bietet
  // sie per <datalist> als Dropdown an. Freie Eingabe bleibt möglich — es ist
  // nur eine Auswahlhilfe, kein hartes Dropdown. So müssen wiederkehrende
  // Erweiterungen nicht jedes Mal neu getippt werden.
  const valueSuggestions = useMemo(() => {
    const map: Record<string, string[]> = {};
    const categoryItems = items.filter(i => i.categoryId === category.id);
    editableAttributes.forEach(attr => {
      if (attr.type !== 'text') return;
      const seen = new Set<string>();
      categoryItems.forEach(i => {
        const v = i.values?.[attr.id];
        if (typeof v === 'string' && v.trim() !== '') {
          seen.add(v.trim());
        }
      });
      if (seen.size > 0) {
        map[attr.id] = Array.from(seen).sort((a, b) => a.localeCompare(b, 'de'));
      }
    });
    return map;
  }, [items, category.id, editableAttributes]);
  
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

    // Verkleinern, als Datei ablegen (in der App) und nur den Verweis merken (#120).
    void prepareImageFile(file)
      .then(storeImage)
      .then((data) => {
        setNewImages(prev => ({ ...prev, [key]: data }));
        // Bei bestehenden Items das Bild sofort persistieren.
        if (item) {
          addImageToItem(item.id, key, data);
        }
      })
      .catch((error) => console.error('Bild konnte nicht übernommen werden:', error));
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

    if (item) {
      // Bestehendes Item: zuerst die Werte speichern, danach Bilder und Links.
      onSave(valuesToSave);

      // Bilder hinzufügen
      Object.entries(newImages).forEach(([attributeId, imageData]) => {
        logger.debug('Adding image for attribute:', attributeId);
        addImageToItem(item.id, attributeId, imageData);
      });

      // Links hinzufügen - optimiert ohne cleanup
      logger.debug('Links zum Speichern:', itemLinks);
      Object.entries(itemLinks).forEach(([attributeId, url]) => {
        if (url) {
          logger.debug('Adding link for attribute:', attributeId, url);
          addLinkToItem(item.id, attributeId, url);
        }
      });

      onCancel();
    } else {
      // Neues Item: Links/Bilder direkt beim Anlegen mitgeben.
      const normalizedLinks: Record<string, string> = {};
      Object.entries(itemLinks).forEach(([attributeId, url]) => {
        const normalized = normalizeLinkUrl(url);
        if (normalized) {
          normalizedLinks[attributeId] = normalized;
        }
      });

      const itemId = onSave(valuesToSave, {
        links: normalizedLinks,
        images: newImages,
      });
      logger.debug('Saved new item ID:', itemId, 'Links:', normalizedLinks);

      if (!itemId) console.warn('No valid item ID for adding media');
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
                          <>
                            <input
                              type="text"
                              id={attr.id}
                              value={formValues[attr.id] || ''}
                              onChange={(e) => handleChange(attr.id, e.target.value, attr.type)}
                              required={attr.required}
                              className={`mt-1 ${inputClass}`}
                              list={valueSuggestions[attr.id] ? `suggestions-${attr.id}` : undefined}
                            />
                            {valueSuggestions[attr.id] && (
                              <datalist id={`suggestions-${attr.id}`}>
                                {valueSuggestions[attr.id].map(option => (
                                  <option key={option} value={option} />
                                ))}
                              </datalist>
                            )}
                          </>
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

export default ItemModal;
