import React, { useState } from 'react';
import { useCategoriesData, useCollectionActions } from '../context/CollectionContext';
import { moveAndRenumber } from '../utils/reorder';
import {
  ICON_OPTIONS,
  COLOR_OPTIONS,
  colorClassForOrder,
  renderCategoryIcon,
} from '../utils/categoryVisuals';
import { Category, AttributeDefinition, AttributeDataType, CORE_ATTRIBUTES } from '../types/models';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  EyeIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline';

// Modal-Komponente für das Hinzufügen/Bearbeiten von Kategorien
interface CategoryModalProps {
  category: Category | null;
  // Vorgabefarbe für neue Kategorien (die order-basierte Farbe, die sie sonst
  // bekäme) — so ist die Vorschau beim Anlegen nicht immer blau (#63).
  defaultColor: string;
  onSave: (categoryData: Partial<Category>) => void;
  onCancel: () => void;
}

const CategoryModal: React.FC<CategoryModalProps> = ({ category, defaultColor, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: category?.name || '',
    description: category?.description || '',
    icon: category?.icon || 'collection',
    // Frei wählbare Farbe (#63): bestehende Kategorie behält ihre Farbe,
    // neue startet mit der Vorgabefarbe.
    color: category?.color || defaultColor,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed z-10 inset-0 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <form onSubmit={handleSubmit}>
            <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100">
                    {category ? 'Kategorie bearbeiten' : 'Neue Kategorie erstellen'}
                  </h3>
                  <div className="mt-2 space-y-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                        Name
                      </label>
                      <input
                        type="text"
                        name="name"
                        id="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        className="mt-1 focus:ring-pokemon-blue focus:border-pokemon-blue block w-full shadow-sm sm:text-sm rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                        Beschreibung
                      </label>
                      <textarea
                        name="description"
                        id="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows={3}
                        className="mt-1 focus:ring-pokemon-blue focus:border-pokemon-blue block w-full shadow-sm sm:text-sm rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                      ></textarea>
                    </div>
                    <div>
                      <label htmlFor="icon" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                        Icon
                      </label>
                      <div className="mt-1 flex items-center gap-3">
                        {/* Vorschau: Icon in der gewählten Farbe (#52/#63). */}
                        <div
                          className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${formData.color}`}
                          aria-label="Icon-Vorschau"
                        >
                          {renderCategoryIcon(formData.icon)}
                        </div>
                        <select
                          name="icon"
                          id="icon"
                          value={formData.icon}
                          onChange={handleChange}
                          className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-pokemon-blue focus:border-pokemon-blue sm:text-sm rounded-md"
                        >
                          {ICON_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Farb-Auswahl (#63) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                        Farbe
                      </label>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {COLOR_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            title={opt.label}
                            aria-label={opt.label}
                            aria-pressed={formData.color === opt.value}
                            onClick={() =>
                              setFormData((prev) => ({ ...prev, color: opt.value }))
                            }
                            className={`h-8 w-8 rounded-full ${opt.value} transition-transform hover:scale-110 ${
                              formData.color === opt.value
                                ? 'ring-2 ring-offset-2 ring-gray-700'
                                : ''
                            }`}
                          />
                        ))}
                      </div>
                    </div>
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
    </div>
  );
};

// Modal-Komponente für das Hinzufügen/Bearbeiten von Attributen
interface AttributeModalProps {
  attribute: AttributeDefinition | null;
  onSave: (attributeData: Partial<AttributeDefinition>) => void;
  onCancel: () => void;
}

const AttributeModal: React.FC<AttributeModalProps> = ({ attribute, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: attribute?.name || '',
    type: attribute?.type || 'text' as AttributeDataType,
    required: attribute?.required || false,
    isVisible: attribute?.isVisible !== false, // Default zu true
    options: attribute?.options?.join('\n') || '',
    isCalculated: attribute?.isCalculated || false,
    formula: attribute?.formula || ''
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checkbox = e.target as HTMLInputElement;
      setFormData(prev => ({ ...prev, [name]: checkbox.checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Optionen aus Multiline-Text parsen
    const options = formData.type === 'dropdown' && formData.options
      ? formData.options.split('\n').filter(opt => opt.trim() !== '')
      : undefined;
    
    onSave({
      ...formData,
      options
    });
  };

  // Wenn das Attribut ein Kernattribut ist, kann es nicht bearbeitet werden
  const isCore = attribute?.isCore || false;

  return (
    <div className="fixed z-10 inset-0 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <form onSubmit={handleSubmit}>
            <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100">
                    {attribute ? 'Attribut bearbeiten' : 'Neues Attribut erstellen'}
                  </h3>
                  
                  {isCore && (
                    <div className="mt-2 p-2 bg-yellow-50 text-yellow-800 rounded border border-yellow-200">
                      Dies ist ein Kernattribut und kann nur eingeschränkt bearbeitet werden.
                    </div>
                  )}
                  
                  <div className="mt-2 space-y-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                        Name
                      </label>
                      <input
                        type="text"
                        name="name"
                        id="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        disabled={isCore}
                        className="mt-1 focus:ring-pokemon-blue focus:border-pokemon-blue block w-full shadow-sm sm:text-sm rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                        Datentyp
                      </label>
                      <select
                        name="type"
                        id="type"
                        value={formData.type}
                        onChange={handleChange}
                        disabled={isCore}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-pokemon-blue focus:border-pokemon-blue sm:text-sm rounded-md"
                      >
                        <option value="text">Text</option>
                        <option value="number">Zahl</option>
                        <option value="boolean">Ja/Nein</option>
                        <option value="date">Datum</option>
                        <option value="dropdown">Auswahlliste</option>
                        <option value="formula">Formel</option>
                      </select>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        name="required"
                        id="required"
                        checked={formData.required}
                        onChange={handleChange}
                        disabled={isCore}
                        className="h-4 w-4 text-pokemon-blue focus:ring-pokemon-blue border-gray-300 dark:border-gray-700 rounded"
                      />
                      <label htmlFor="required" className="ml-2 block text-sm text-gray-900 dark:text-gray-100">
                        Pflichtfeld
                      </label>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        name="isVisible"
                        id="isVisible"
                        checked={formData.isVisible}
                        onChange={handleChange}
                        className="h-4 w-4 text-pokemon-blue focus:ring-pokemon-blue border-gray-300 dark:border-gray-700 rounded"
                      />
                      <label htmlFor="isVisible" className="ml-2 block text-sm text-gray-900 dark:text-gray-100">
                        In Listen und Übersichten anzeigen
                      </label>
                    </div>
                    
                    {formData.type === 'dropdown' && (
                      <div>
                        <label htmlFor="options" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                          Auswahloptionen (eine pro Zeile)
                        </label>
                        <textarea
                          name="options"
                          id="options"
                          value={formData.options}
                          onChange={handleChange}
                          rows={4}
                          className="mt-1 focus:ring-pokemon-blue focus:border-pokemon-blue block w-full shadow-sm sm:text-sm rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                        ></textarea>
                        
                        {/* Hinweis für Grading Service */}
                        {attribute?.id === 'gradingService' && (
                          <div className="mt-2 text-xs text-blue-600 bg-blue-50 p-2 rounded">
                            Hier können weitere Grading Services hinzugefügt werden. Gib einfach jeden Service in einer neuen Zeile ein.
                          </div>
                        )}
                        
                        {/* Hinweis für Sealed Produkt Kategorien */}
                        {attribute?.id === 'category' && (
                          <div className="mt-2 text-xs text-blue-600 bg-blue-50 p-2 rounded">
                            Hier können weitere Kategorien für Sealed Produkte hinzugefügt werden. Gib einfach jede Kategorie in einer neuen Zeile ein.
                          </div>
                        )}
                      </div>
                    )}
                    
                    {formData.type === 'formula' && (
                      <div>
                        <label htmlFor="formula" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                          Formel
                        </label>
                        <input
                          type="text"
                          name="formula"
                          id="formula"
                          value={formData.formula}
                          onChange={handleChange}
                          placeholder="z.B. quantity * currentValue"
                          disabled={isCore}
                          className="mt-1 focus:ring-pokemon-blue focus:border-pokemon-blue block w-full shadow-sm sm:text-sm rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Verwende Attributnamen als Variablen, z.B. quantity * price
                        </p>
                      </div>
                    )}
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
    </div>
  );
};

// Hilfsfunktion, um den Attributtyp lesbarer zu machen
const getAttributeTypeName = (type: AttributeDataType): string => {
  switch (type) {
    case 'text':
      return 'Text';
    case 'number':
      return 'Zahl';
    case 'boolean':
      return 'Ja/Nein';
    case 'date':
      return 'Datum';
    case 'dropdown':
      return 'Auswahl';
    case 'formula':
      return 'Formel';
    default:
      return type;
  }
};

const CategoryManagement: React.FC = () => {
  // Re-Render-Isolation (#18): nur den Categories-Slice + die (stabilen) Actions.
  const categories = useCategoriesData();
  const {
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    addAttributeToCategory,
    updateAttribute,
    deleteAttribute,
    resetToDefaults,
  } = useCollectionActions();
  
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    categories.length > 0 ? categories[0].id : null
  );
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showAttributeModal, setShowAttributeModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingAttribute, setEditingAttribute] = useState<AttributeDefinition | null>(null);
  
  // Sortiere Kategorien nach der Reihenfolge
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
  
  // Finde die aktuell ausgewählte Kategorie
  const selectedCategory = selectedCategoryId 
    ? categories.find(cat => cat.id === selectedCategoryId) 
    : null;
  
  // Sortiere Attribute nach der Reihenfolge
  const sortedAttributes = selectedCategory 
    ? [...selectedCategory.attributes].sort((a, b) => a.order - b.order)
    : [];
  
  // Handling für das Hinzufügen/Bearbeiten einer Kategorie
  const handleAddEditCategory = (category: Category | null) => {
    setEditingCategory(category);
    setShowCategoryModal(true);
  };
  
  // Handling für das Hinzufügen/Bearbeiten eines Attributs
  const handleAddEditAttribute = (attribute: AttributeDefinition | null) => {
    setEditingAttribute(attribute);
    setShowAttributeModal(true);
  };
  
  // Handling für das Löschen eines Attributs
  const handleDeleteAttribute = (attributeId: string) => {
    if (!selectedCategoryId) return;
    
    const attribute = selectedCategory?.attributes.find(a => a.id === attributeId);
    if (!attribute) return;
    
    // Kernattribute können nicht gelöscht werden
    if (attribute.isCore) {
      alert('Kernattribute können nicht gelöscht werden.');
      return;
    }
    
    if (window.confirm('Bist du sicher, dass du dieses Attribut löschen möchtest? Die Daten gehen verloren.')) {
      deleteAttribute(selectedCategoryId, attributeId);
    }
  };
  
  // Handling für die Änderung der Reihenfolge von Attributen.
  // moveAndRenumber (utils/reorder.ts, getestet) verschiebt um genau eine
  // Position und nummeriert order lückenlos neu — robust gegen vorher
  // kaputte order-Werte (#29-Folgefix).
  const handleMoveAttribute = (attributeId: string, direction: 'up' | 'down') => {
    if (!selectedCategoryId || !selectedCategory) return;
    const renumbered = moveAndRenumber(
      selectedCategory.attributes,
      attributeId,
      direction
    );
    if (!renumbered) return; // schon am Rand / nichts zu tun
    updateCategory(selectedCategoryId, { attributes: renumbered });
  };

  // Handling für die Änderung der Reihenfolge von Kategorien.
  const handleMoveCategory = (categoryId: string, direction: 'up' | 'down') => {
    const renumbered = moveAndRenumber(categories, categoryId, direction);
    if (!renumbered) return;
    // In EINEM Update neu durchnummerieren (kein Doppel-updateCategory,
    // das sich gegenseitig überschreiben konnte).
    reorderCategories(renumbered.map(c => c.id));
  };
  
  // Kategorie speichern
  const handleSaveCategory = (categoryData: Partial<Category>) => {
    if (editingCategory) {
      // Kategorie aktualisieren
      updateCategory(editingCategory.id, categoryData);
    } else {
      // Neue Kategorie hinzufügen - mit CORE_ATTRIBUTES und order
      const nextOrder = Math.max(...categories.map(c => c.order), -1) + 1;
      const newCategoryData = {
        ...categoryData,
        attributes: [...CORE_ATTRIBUTES], // Alle neuen Kategorien müssen die Kern-Attribute haben
        order: nextOrder
      };
      const newCategoryId = addCategory(newCategoryData as Category);
      
      // Nur die Kategorie auswählen, aber nicht zur Detailseite navigieren
      setSelectedCategoryId(newCategoryId);
    }
    setShowCategoryModal(false);
  };
  
  // Attribut speichern
  const handleSaveAttribute = (attributeData: Partial<AttributeDefinition>) => {
    if (!selectedCategoryId) return;
    
    if (editingAttribute) {
      // Attribut aktualisieren
      updateAttribute(selectedCategoryId, editingAttribute.id, attributeData);
    } else {
      // Neues Attribut hinzufügen
      addAttributeToCategory(selectedCategoryId, attributeData as AttributeDefinition);
    }
    setShowAttributeModal(false);
  };
  
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <h1 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100">
            Kategorien verwalten
          </h1>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('ACHTUNG: Alle deine Daten werden gelöscht!\n\nMöchtest du wirklich alle Daten auf die Standardwerte zurücksetzen? Alle eigenen Einträge und Kategorien gehen dabei unwiderruflich verloren.\n\nErstelle vorher unbedingt ein Backup deiner Daten über die Export-Funktion im Dashboard!')) {
                  resetToDefaults();
                }
              }}
              className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-700 text-sm leading-4 font-medium rounded-md shadow-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pokemon-blue"
            >
              Auf Standard zurücksetzen
            </button>
            <button
              type="button"
              onClick={() => handleAddEditCategory(null)}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-pokemon-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pokemon-blue"
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              Neue Kategorie
            </button>
          </div>
        </div>
      </div>
      
      <div className="md:grid md:grid-cols-6 md:gap-6">
        {/* Kategorie-Liste */}
        <div className="md:col-span-2">
          <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {sortedCategories.map((category) => (
                <li key={category.id} className="relative">
                  <div
                    onClick={() => setSelectedCategoryId(category.id)}
                    className={`block hover:bg-gray-50 dark:hover:bg-gray-700 w-full text-left cursor-pointer ${selectedCategoryId === category.id ? 'bg-gray-50 dark:bg-gray-700' : ''}`}
                  >
                    <div className="px-4 py-4 sm:px-6 flex items-center">
                      <div className="min-w-0 flex-1">
                        <p className={`truncate font-medium ${category.hidden ? 'text-gray-400 dark:text-gray-500' : ''}`}>
                          {category.name}
                          {category.hidden && (
                            <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">(ausgeblendet)</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCategory(category.id, { hidden: !category.hidden });
                          }}
                          title={category.hidden ? 'In der Navigation einblenden' : 'Aus der Navigation ausblenden'}
                          className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                        >
                          {category.hidden ? (
                            <EyeSlashIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                          ) : (
                            <EyeIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveCategory(category.id, 'up');
                          }}
                          className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                        >
                          <ArrowUpIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveCategory(category.id, 'down');
                          }}
                          className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                        >
                          <ArrowDownIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddEditCategory(category);
                          }}
                          className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                        >
                          <PencilIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Bist du sicher, dass du diese Kategorie löschen möchtest? Alle zugehörigen Daten gehen verloren.')) {
                              deleteCategory(category.id);
                              if (selectedCategoryId === category.id) {
                                // Wähle die erste verbleibende Kategorie aus (außer der gerade gelöschten)
                                const remainingCategories = categories.filter(c => c.id !== category.id);
                                setSelectedCategoryId(remainingCategories.length > 0 ? remainingCategories[0].id : null);
                              }
                            }
                          }}
                          className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                        >
                          <TrashIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
              
              {categories.length === 0 && (
                <li className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                  Keine Kategorien vorhanden. Klicke auf "Neue Kategorie", um eine zu erstellen.
                </li>
              )}
            </ul>
          </div>
        </div>
      
        {/* Attribut-Liste */}
        <div className="mt-5 md:mt-0 md:col-span-4">
          {selectedCategory ? (
            <div className="bg-white dark:bg-gray-800 shadow sm:rounded-md">
              <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
                <h2 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100">
                  Attribute für: {selectedCategory.name}
                </h2>
                <button
                  type="button"
                  onClick={() => handleAddEditAttribute(null)}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-pokemon-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pokemon-blue"
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  Neues Attribut
                </button>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Name
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Typ
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Pflicht
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Sichtbar
                      </th>
                      <th scope="col" className="relative px-6 py-3">
                        <span className="sr-only">Aktionen</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {sortedAttributes.map((attribute) => (
                      <tr key={attribute.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                          {attribute.name}
                          {attribute.isCore && (
                            <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                              Core
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {getAttributeTypeName(attribute.type)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {attribute.required ? 'Ja' : 'Nein'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {attribute.isVisible !== false ? 'Ja' : 'Nein'}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-medium">
                          <div className="flex justify-end items-center space-x-2">
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                handleMoveAttribute(attribute.id, 'up');
                              }}
                              className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              <ArrowUpIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                handleMoveAttribute(attribute.id, 'down');
                              }}
                              className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              <ArrowDownIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                handleAddEditAttribute(attribute);
                              }}
                              className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              <PencilIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                            </button>
                            {!attribute.isCore && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDeleteAttribute(attribute.id);
                                }}
                                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                              >
                                <TrashIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    
                    {sortedAttributes.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-6 text-center text-gray-500 dark:text-gray-400">
                          Keine Attribute vorhanden. Klicke auf "Neues Attribut", um eines zu erstellen.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 shadow sm:rounded-md p-6 text-center text-gray-500 dark:text-gray-400">
              Bitte wähle eine Kategorie aus, um deren Attribute zu bearbeiten oder erstelle eine neue Kategorie.
            </div>
          )}
        </div>
      </div>
      
      {/* Kategorie-Modal */}
      {showCategoryModal && (
        <CategoryModal
          category={editingCategory}
          defaultColor={colorClassForOrder(
            editingCategory?.order ?? Math.max(...categories.map(c => c.order), -1) + 1
          )}
          onSave={handleSaveCategory}
          onCancel={() => setShowCategoryModal(false)}
        />
      )}
      
      {/* Attribut-Modal */}
      {showAttributeModal && (
        <AttributeModal
          attribute={editingAttribute}
          onSave={handleSaveAttribute}
          onCancel={() => setShowAttributeModal(false)}
        />
      )}
    </div>
  );
};

export default CategoryManagement;