import React, { useState } from 'react';
import { 
  DocumentArrowDownIcon, 
  ArrowDownTrayIcon, 
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowUpTrayIcon
} from '@heroicons/react/24/outline';
import { useCategoriesData, useCollectionActions } from '../context/CollectionContext';
import { useLoading } from '../context/LoadingContext';
import { wrapBackup, validateBackup } from '../utils/backup';

const ImportExport: React.FC = () => {
  // Re-Render-Isolation (#18): nur den Categories-Slice + die (stabilen) Actions.
  const categories = useCategoriesData();
  const {
    exportData,
    importData,
    exportCategoryAsExcel,
    createExcelTemplate,
    exportCollectionAsExcel,
    getItemsByCategoryId,
  } = useCollectionActions();
  
  const { showLoading, hideLoading } = useLoading();

  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('export');

  // Wickelt einen asynchronen Export so, dass das Overlay erst nach
  // OVERLAY_DELAY_MS sichtbar wird — schnelle Operationen (kleine
  // Sammlung, JSON-Stringify) zeigen also gar nichts, anstatt einmal
  // kurz aufzublitzen. `setPhase` aktualisiert den Overlay-Text, falls
  // das Overlay bis dahin angezeigt wurde, sonst nur die Botschaft,
  // die beim Erstauftritt verwendet wird. `setIsLoading(true)` läuft
  // sofort, damit Buttons in der UI ohne Delay deaktiviert sind.
  const OVERLAY_DELAY_MS = 200;
  const runWithLoading = async <T,>(
    initialMessage: string,
    task: (setPhase: (msg: string) => void) => Promise<T>,
  ): Promise<T> => {
    let shown = false;
    let pendingMessage = initialMessage;
    setIsLoading(true);
    const timer = window.setTimeout(() => {
      shown = true;
      showLoading(pendingMessage);
    }, OVERLAY_DELAY_MS);

    const setPhase = (msg: string) => {
      pendingMessage = msg;
      if (shown) showLoading(msg);
    };

    try {
      return await task(setPhase);
    } finally {
      window.clearTimeout(timer);
      if (shown) hideLoading();
      setIsLoading(false);
    }
  };

  // Stößt den Download eines Blobs im Browser an und räumt die
  // ObjectURL und den temporären <a>-Tag wieder weg.
  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    if (link.parentNode) {
      link.parentNode.removeChild(link);
    }
    window.URL.revokeObjectURL(url);
  };

  const flashSuccess = (msg: string) => {
    setImportError(null);
    setImportSuccess(msg);
    setTimeout(() => setImportSuccess(null), 3000);
  };

  const flashError = (msg: string) => {
    setImportSuccess(null);
    setImportError(msg);
    setTimeout(() => setImportError(null), 3000);
  };

  // JSON-Export der gesamten Sammlung
  const handleJsonExport = async () => {
    try {
      await runWithLoading('Sammle Daten...', async (setPhase) => {
        const data = exportData();
        setPhase('Erstelle Datei...');
        // In eine versionierte Hülle verpacken, damit künftige
        // Formatänderungen migrierbar bleiben (#30).
        const dataStr = JSON.stringify(wrapBackup(data), null, 2);
        const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
        setPhase('Speichere...');
        downloadBlob(blob, 'collectodex-export.json');
      });
      flashSuccess('Die Sammlung wurde erfolgreich als JSON exportiert.');
    } catch (error) {
      console.error('Fehler beim JSON-Export:', error);
      flashError('Fehler beim Exportieren der Sammlung.');
    }
  };

  // Excel-Export der gesamten Sammlung
  const handleExcelExport = async () => {
    try {
      const blob = await runWithLoading('Excel-Export wird erstellt...', async (setPhase) => {
        setPhase('Sammle Daten...');
        const result = await exportCollectionAsExcel();
        setPhase('Speichere...');
        return result;
      });
      if (blob) {
        downloadBlob(blob, 'collectodex-export.xlsx');
        flashSuccess('Die Sammlung wurde erfolgreich als Excel-Datei exportiert. Hinweis: Bilder sind nicht enthalten.');
      } else {
        flashError('Fehler beim Excel-Export.');
      }
    } catch (error) {
      console.error('Excel export error:', error);
      flashError('Fehler beim Excel-Export.');
    }
  };

  // Excel-Export für eine bestimmte Kategorie
  const handleCategoryExcelExport = async (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) {
      flashError('Fehler beim Excel-Export. Kategorie nicht gefunden.');
      return;
    }
    try {
      const blob = await runWithLoading(
        `Excel-Export für "${category.name}" wird erstellt...`,
        async (setPhase) => {
          setPhase('Sammle Daten...');
          const result = await exportCategoryAsExcel(categoryId);
          setPhase('Speichere...');
          return result;
        },
      );
      if (blob) {
        const fileName = `${category.name.replace(/\s+/g, '-').toLowerCase() || 'kategorie'}-export.xlsx`;
        downloadBlob(blob, fileName);
        flashSuccess('Die Kategorie wurde erfolgreich als Excel-Datei exportiert. Links sind als Hyperlinks enthalten.');
      } else {
        flashError('Fehler beim Excel-Export. Kategorie nicht gefunden.');
      }
    } catch (error) {
      console.error('Excel category export error:', error);
      flashError('Fehler beim Excel-Export.');
    }
  };

  // Excel-Template für eine bestimmte Kategorie generieren
  const handleExcelTemplateDownload = async (categoryId: string) => {
    try {
      const blob = await runWithLoading('Excel-Vorlage wird erstellt...', async (setPhase) => {
        setPhase('Sammle Daten...');
        const result = await createExcelTemplate(categoryId);
        setPhase('Speichere...');
        return result;
      });
      if (blob) {
        const category = categories.find(c => c.id === categoryId);
        const fileName = `${category?.name.replace(/\s+/g, '-').toLowerCase() || 'kategorie'}-vorlage.xlsx`;
        downloadBlob(blob, fileName);
        flashSuccess('Die Excel-Vorlage wurde erfolgreich heruntergeladen.');
      } else {
        flashError('Fehler beim Excel-Template-Download. Kategorie nicht gefunden.');
      }
    } catch (error) {
      console.error('Excel template error:', error);
      flashError('Fehler beim Excel-Template-Download.');
    }
  };
  
  // JSON-Import der gesamten Sammlung
  const handleJsonImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (event.target.files && event.target.files.length > 0) {
      showLoading('Lese JSON-Datei...');
      setIsLoading(true);
      
      fileReader.readAsText(event.target.files[0], "UTF-8");
      
      fileReader.onload = async (e) => {
        try {
          if (e.target && e.target.result) {
            showLoading('Analysiere Daten...');
            
            // Kurze Verzögerung für UI-Update
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const jsonStr = e.target.result as string;
            const parsed = JSON.parse(jsonStr);

            // Struktur validieren, bevor irgendetwas in den State
            // geschrieben wird — eine versehentlich gewählte fremde oder
            // kaputte Datei darf die Sammlung nicht beschädigen (#30).
            const validation = validateBackup(parsed);
            if (!validation.ok) {
              hideLoading();
              setIsLoading(false);
              setImportError(`Die Datei ist keine gültige Sicherung: ${validation.error}`);
              return;
            }

            // Der Import ersetzt die aktuelle Sammlung vollständig —
            // vorher bestätigen lassen.
            hideLoading();
            const confirmed = window.confirm(
              `Achtung: Der Import ersetzt deine aktuelle Sammlung ` +
                `(${categories.length} Kategorien) durch die Sicherung ` +
                `(${validation.data.categories.length} Kategorien, ` +
                `${validation.data.items.length} Einträge).\n\n` +
                `Dieser Schritt kann nicht rückgängig gemacht werden. Fortfahren?`
            );
            if (!confirmed) {
              setIsLoading(false);
              return;
            }

            showLoading('Importiere Daten in die Sammlung...');

            // Import in separatem Task ausführen, um UI nicht zu blockieren
            setTimeout(() => {
              try {
                importData(validation.data);
                hideLoading();
                setIsLoading(false);
                setImportError(null);
                setImportSuccess("Die Sammlung wurde erfolgreich importiert.");
                setTimeout(() => setImportSuccess(null), 3000);
              } catch (importError) {
                console.error("Import processing error:", importError);
                hideLoading();
                setIsLoading(false);
                setImportError(`Fehler beim Importieren der Daten: ${(importError as Error).message}`);
              }
            }, 300);
          }
        } catch (parseError) {
          console.error("JSON parse error:", parseError);
          hideLoading();
          setIsLoading(false);
          setImportError("Die Datei konnte nicht importiert werden. Ungültiges JSON-Format.");
        }
      };
      
      fileReader.onerror = () => {
        console.error("File reading error");
        hideLoading();
        setIsLoading(false);
        setImportError("Fehler beim Lesen der Datei.");
      };
    }
  };
  
  return (
    <div className="w-full px-4 py-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Import / Export</h1>

      {/* Tabs für Übersichtlichkeit */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex space-x-4 overflow-x-auto scrollbar-hide">
          <button
            className={`${
              activeTab === 'export'
                ? 'border-pokemon-blue text-pokemon-blue'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
            onClick={() => setActiveTab('export')}
          >
            Export
          </button>
          <button
            className={`${
              activeTab === 'import'
                ? 'border-pokemon-blue text-pokemon-blue'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
            onClick={() => setActiveTab('import')}
          >
            Import
          </button>
        </nav>
      </div>

      {/* Export Tab */}
      {activeTab === 'export' && (
        <div>
          <div className="mb-6 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-100">
            <h2 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Daten exportieren</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
              Exportiere deine Sammlung in verschiedenen Formaten.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              <strong>Hinweis:</strong> Für vollständige Sicherungen mit Bildern nutze JSON-Export.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-4">
              <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                <h3 className="font-medium mb-2">JSON Export</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Komplette Sicherung der Sammlung inklusive Bilder und Einstellungen.
                </p>
                <button
                  onClick={handleJsonExport}
                  disabled={isLoading}
                  className="w-full flex justify-center items-center px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-pokemon-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pokemon-blue"
                >
                  <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
                  JSON exportieren
                </button>
              </div>
              
              <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                <h3 className="font-medium mb-2">Excel Export (Komplett)</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Export aller Kategorien und deren Einträge als Excel-Datei.
                </p>
                <button
                  onClick={handleExcelExport}
                  disabled={isLoading}
                  className="w-full flex justify-center items-center px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-pokemon-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pokemon-blue"
                >
                  <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
                  Excel exportieren
                </button>
              </div>
            </div>
            
            <div className="mt-6 border-t border-blue-100 pt-5">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Kategorie-Export</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Excel enthält keine Bilder — Tabellen-Tools verkraften keine
                Base64-Blobs. Für einen vollständigen Round-Trip mit Bildern
                bitte den JSON-Export oben verwenden.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {categories.map((category) => (
                  <div key={category.id} className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                    <h4 className="font-medium mb-2 text-sm">{category.name}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      {getItemsByCategoryId(category.id).length} Einträge
                    </p>
                    <div className="flex flex-col space-y-2">
                      <button
                        onClick={() => handleCategoryExcelExport(category.id)}
                        disabled={isLoading}
                        className="w-full flex justify-center items-center px-2 py-1.5 border border-transparent rounded-md shadow-sm text-xs font-medium text-white bg-pokemon-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pokemon-blue"
                      >
                        <ArrowUpTrayIcon className="h-4 w-4 mr-1.5" />
                        Als Excel exportieren
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="mt-6 border-t border-blue-100 pt-5">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Vorlagen herunterladen</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-2">
                {categories.map((category) => (
                  <div key={category.id} className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                    <h4 className="font-medium mb-2 text-sm">{category.name}</h4>
                    <div className="flex flex-col space-y-2">
                      <button
                        onClick={() => handleExcelTemplateDownload(category.id)}
                        disabled={isLoading}
                        className="w-full flex justify-center items-center px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-md shadow-sm text-xs font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pokemon-blue"
                      >
                        <DocumentArrowDownIcon className="h-4 w-4 mr-1.5" />
                        Excel-Vorlage
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Tab */}
      {activeTab === 'import' && (
        <div>
          <div className="mb-6 p-3 sm:p-4 bg-yellow-50 rounded-lg border border-yellow-100">
            <h2 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Daten importieren</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
              Stelle deine Sammlung aus einer vorherigen JSON-Sicherung wieder her.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              <strong>Hinweis:</strong> Ein Import überschreibt eventuell vorhandene Daten. Erstelle vorher eine Sicherung!
            </p>

            <div className="mt-4">
              <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                <h3 className="font-medium mb-2 text-sm">JSON Import (Vollständig)</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Stellt eine komplette Sicherung inklusive Bilder und Links wieder her.
                </p>
                <div className="mt-2">
                  <label
                    htmlFor="json-file-upload"
                    className="w-full inline-flex justify-center items-center px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-pokemon-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pokemon-blue cursor-pointer"
                  >
                    <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                    JSON Datei auswählen
                  </label>
                  <input
                    id="json-file-upload"
                    name="json-file-upload"
                    type="file"
                    accept=".json"
                    className="sr-only"
                    onChange={handleJsonImport}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>
          </div>
          
          {importError && (
            <div className="fixed bottom-4 right-4 flex items-center bg-red-100 text-red-700 px-4 py-3 rounded-lg shadow-lg max-w-md">
              <ExclamationCircleIcon className="h-5 w-5 mr-2" />
              <span>{importError}</span>
            </div>
          )}
          
          {importSuccess && (
            <div className="fixed bottom-4 right-4 flex items-center bg-green-100 text-green-700 px-4 py-3 rounded-lg shadow-lg max-w-md">
              <CheckCircleIcon className="h-5 w-5 mr-2" />
              <span>{importSuccess}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImportExport;