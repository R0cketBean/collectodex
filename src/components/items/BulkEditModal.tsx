import React, { useState, useMemo } from 'react';
import { AttributeDefinition } from '../../types/models';
import { inputClass, primaryButtonClass, secondaryButtonClass, selectClass } from '../../utils/formStyles';
import { parseDateInput } from '../../utils/dateInput';

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
                className={`${primaryButtonClass} w-full sm:ml-3 sm:w-auto`}
              >
                Auf {selectedCount} Einträge anwenden
              </button>
              <button
                type="button"
                onClick={onCancel}
                className={`${secondaryButtonClass} mt-3 w-full sm:mt-0 sm:ml-3 sm:w-auto`}
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

export default BulkEditModal;
