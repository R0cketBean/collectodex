import React, { useState } from 'react';
import { 
  DocumentArrowDownIcon, 
  ArrowDownTrayIcon, 
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowUpTrayIcon,
  EyeSlashIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { useCollection } from '../context/CollectionContext';
import { useLoading } from '../context/LoadingContext';

const ImportExport: React.FC = () => {
  const { 
    categories, 
    exportData, 
    importData, 
    exportCategoryAsCSV, 
    createCategoryTemplate, 
    importCSV,
    importExcel,
    exportCategoryAsExcel,
    createExcelTemplate,
    exportCollectionAsExcel,
    getItemsByCategoryId
  } = useCollection();
  
  const { showLoading, hideLoading } = useLoading();
  
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('export');
  const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);
  
  // Toggle Kategorie-Sichtbarkeit
  const toggleCategoryVisibility = (categoryId: string) => {
    setHiddenCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId) 
        : [...prev, categoryId]
    );
  };
  
  // JSON-Export der gesamten Sammlung
  const handleJsonExport = async () => {
    try {
      setIsLoading(true);
      showLoading('Exportiere Sammlung als JSON...');
      
      // Kurze Verzögerung, um sicherzustellen, dass der Loading-Indikator angezeigt wird
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verwende einen Web Worker für den Export
      const exportWorker = () => {
        return new Promise<string>((resolve) => {
          setTimeout(() => {
            // Daten aus dem Context holen
            const data = exportData();
            
            // JSON mit hübscher Formatierung erstellen
            const dataStr = JSON.stringify(data, null, 2);
            resolve(dataStr);
          }, 0);
        });
      };
      
      showLoading('Konvertiere Daten...');
      const dataStr = await exportWorker();
      
      showLoading('Erstelle Download...');
      // Verzögerung für UI-Aktualisierung
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Erstelle einen Download-Link
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const exportFileDefaultName = 'pokemon-sammlung-export.json';
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      
      // Führe den Download aus
      linkElement.click();
      
      // Fertigmeldung anzeigen
      hideLoading();
      setIsLoading(false);
      setImportSuccess("Die Sammlung wurde erfolgreich als JSON exportiert.");
      setTimeout(() => setImportSuccess(null), 3000);
      
    } catch (error) {
      console.error('Fehler beim JSON-Export:', error);
      hideLoading();
      setIsLoading(false);
      setImportError("Fehler beim Exportieren der Sammlung.");
      setTimeout(() => setImportError(null), 3000);
    }
  };
  
  // Excel-Export der gesamten Sammlung
  const handleExcelExport = async () => {
    try {
      setIsLoading(true);
      showLoading('Erstelle Excel-Export. Die Generierung großer Exporte kann etwas dauern...');
      
      // Kurze Verzögerung für UI-Update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Excel-Export in separatem Task ausführen
      const exportWorker = () => {
        return new Promise<Blob | null>(async (resolve) => {
          try {
            showLoading('Verarbeite Daten und erstelle Excel-Datei...');
            const blob = await exportCollectionAsExcel();
            resolve(blob);
          } catch (error) {
            console.error("Excel export worker error:", error);
            resolve(null);
          }
        });
      };
      
      const blob = await exportWorker();
      
      if (blob) {
        showLoading('Excel-Export fertig. Erstelle Download...');
        // Verzögerung für UI-Update
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'pokemon-sammlung-export.xlsx');
        document.body.appendChild(link);
        link.click();
        
        // Aufräumen
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
        window.URL.revokeObjectURL(url);
        
        hideLoading();
        setIsLoading(false);
        setImportSuccess("Die Sammlung wurde erfolgreich als Excel-Datei exportiert. Hinweis: Bilder sind nicht enthalten.");
      } else {
        hideLoading();
        setIsLoading(false);
        setImportError("Fehler beim Excel-Export.");
      }
    } catch (error) {
      console.error("Excel export error:", error);
      hideLoading();
      setIsLoading(false);
      setImportError("Fehler beim Excel-Export.");
    } finally {
      setTimeout(() => {
        setImportSuccess(null);
        setImportError(null);
      }, 3000);
    }
  };
  
  // CSV-Export für eine bestimmte Kategorie
  const handleCsvExport = (categoryId: string) => {
    const csvData = exportCategoryAsCSV(categoryId);
    if (csvData) {
      const dataUri = 'data:text/csv;charset=utf-8,'+ encodeURIComponent(csvData.content);
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', csvData.fileName);
      linkElement.click();
      
      setImportSuccess(`Die Kategorie wurde erfolgreich als CSV exportiert. Hinweis: Links und Bilder sind nicht enthalten.`);
      setTimeout(() => setImportSuccess(null), 3000);
    } else {
      setImportError("Fehler beim CSV-Export. Kategorie nicht gefunden.");
    }
  };
  
  // Excel-Export für eine bestimmte Kategorie
  const handleCategoryExcelExport = async (categoryId: string) => {
    try {
      setIsLoading(true);
      showLoading('Erstelle Excel-Export für die Kategorie...');
      
      // Kategorie-Namen ermitteln
      const category = categories.find(c => c.id === categoryId);
      if (!category) {
        throw new Error("Kategorie nicht gefunden");
      }
      
      // Kurze Verzögerung für UI-Update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Excel-Export in separatem Task ausführen
      const exportWorker = () => {
        return new Promise<Blob | null>(async (resolve) => {
          try {
            showLoading(`Verarbeite Daten für Kategorie "${category.name}"...`);
            const blob = await exportCategoryAsExcel(categoryId);
            resolve(blob);
          } catch (error) {
            console.error("Excel category export worker error:", error);
            resolve(null);
          }
        });
      };
      
      const blob = await exportWorker();
      
      if (blob) {
        showLoading('Excel-Export fertig. Erstelle Download...');
        // Verzögerung für UI-Update
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const fileName = `${category.name.replace(/\s+/g, '-').toLowerCase() || 'kategorie'}-export.xlsx`;
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        
        // Aufräumen
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
        window.URL.revokeObjectURL(url);
        
        hideLoading();
        setIsLoading(false);
        setImportSuccess(`Die Kategorie wurde erfolgreich als Excel-Datei exportiert. Links sind als Hyperlinks enthalten.`);
      } else {
        hideLoading();
        setIsLoading(false);
        setImportError("Fehler beim Excel-Export. Kategorie nicht gefunden.");
      }
    } catch (error) {
      console.error("Excel category export error:", error);
      hideLoading();
      setIsLoading(false);
      setImportError("Fehler beim Excel-Export.");
    } finally {
      setTimeout(() => {
        setImportSuccess(null);
        setImportError(null);
      }, 3000);
    }
  };
  
  // CSV-Template für eine bestimmte Kategorie generieren
  const handleCsvTemplateDownload = (categoryId: string) => {
    const templateData = createCategoryTemplate(categoryId);
    if (templateData) {
      const dataUri = 'data:text/csv;charset=utf-8,'+ encodeURIComponent(templateData.content);
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', templateData.fileName);
      linkElement.click();
      
      setImportSuccess(`Das CSV-Template wurde erfolgreich heruntergeladen.`);
      setTimeout(() => setImportSuccess(null), 3000);
    } else {
      setImportError("Fehler beim Template-Download. Kategorie nicht gefunden.");
    }
  };
  
  // Excel-Template für eine bestimmte Kategorie generieren
  const handleExcelTemplateDownload = async (categoryId: string) => {
    try {
      setIsLoading(true);
      const blob = await createExcelTemplate(categoryId);
      if (blob) {
        const category = categories.find(c => c.id === categoryId);
        const fileName = `${category?.name.replace(/\s+/g, '-').toLowerCase() || 'kategorie'}-vorlage.xlsx`;
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        
        // Aufräumen
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
        window.URL.revokeObjectURL(url);
        
        setImportSuccess(`Die Excel-Vorlage wurde erfolgreich heruntergeladen.`);
      } else {
        setImportError("Fehler beim Excel-Template-Download. Kategorie nicht gefunden.");
      }
    } catch (error) {
      console.error("Excel template error:", error);
      setImportError("Fehler beim Excel-Template-Download.");
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        setImportSuccess(null);
        setImportError(null);
      }, 3000);
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
            const data = JSON.parse(jsonStr);
            
            showLoading('Importiere Daten in die Sammlung...');
            
            // Import in separatem Task ausführen, um UI nicht zu blockieren
            setTimeout(() => {
              try {
                importData(data);
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
  
  // CSV-Import für eine bestimmte Kategorie
  const handleCsvImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCategoryId) {
      setImportError("Bitte wähle eine Kategorie aus.");
      return;
    }
    
    const fileReader = new FileReader();
    if (event.target.files && event.target.files.length > 0) {
      setIsLoading(true);
      
      fileReader.readAsText(event.target.files[0], "UTF-8");
      fileReader.onload = e => {
        try {
          if (e.target && e.target.result) {
            const csvContent = e.target.result as string;
            const result = importCSV(selectedCategoryId, csvContent);
            
            if (result.success) {
              setImportError(null);
              setImportSuccess(`${result.count} Einträge wurden erfolgreich importiert.`);
              
              // Hinweis auf Warnungen anzeigen, falls vorhanden
              if (result.errors.length > 0) {
                setTimeout(() => {
                  setImportSuccess(null);
                  setImportError(`Import erfolgreich, aber mit ${result.errors.length} Warnungen:\n${result.errors.slice(0, 3).join('\n')}${result.errors.length > 3 ? `\n...und ${result.errors.length - 3} weitere` : ''}`);
                }, 3000);
              }
            } else {
              setImportError(`Import fehlgeschlagen: ${result.errors[0]}${result.errors.length > 1 ? ` (und ${result.errors.length - 1} weitere Fehler)` : ''}`);
            }
          }
        } catch (error) {
          console.error("CSV Import error:", error);
          setImportError(`Fehler beim CSV-Import: ${(error as Error).message}`);
        } finally {
          setIsLoading(false);
          setTimeout(() => {
            if (importSuccess) setImportSuccess(null);
          }, 3000);
        }
      };
      
      fileReader.onerror = () => {
        setImportError("Fehler beim Lesen der Datei.");
        setIsLoading(false);
      };
    }
  };

  // Excel-Import für eine bestimmte Kategorie
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleExcelImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCategoryId) {
      setImportError("Bitte wähle eine Kategorie aus.");
      return;
    }
    
    if (event.target.files && event.target.files.length > 0) {
      setIsLoading(true);
      
      try {
        const file = event.target.files[0];
        const arrayBuffer = await file.arrayBuffer();
        
        const result = await importExcel(selectedCategoryId, arrayBuffer);
        
        if (result.success) {
          setImportError(null);
          setImportSuccess(`${result.count} Einträge wurden erfolgreich importiert.`);
          
          // Hinweis auf Warnungen anzeigen, falls vorhanden
          if (result.errors.length > 0) {
            setTimeout(() => {
              setImportSuccess(null);
              setImportError(`Import erfolgreich, aber mit ${result.errors.length} Warnungen:\n${result.errors.slice(0, 3).join('\n')}${result.errors.length > 3 ? `\n...und ${result.errors.length - 3} weitere` : ''}`);
            }, 3000);
          }
        } else {
          setImportError(`Excel-Import fehlgeschlagen: ${result.errors[0]}${result.errors.length > 1 ? ` (und ${result.errors.length - 1} weitere Fehler)` : ''}`);
        }
      } catch (error) {
        console.error("Excel Import error:", error);
        setImportError(`Fehler beim Excel-Import: ${(error as Error).message}`);
      } finally {
        setIsLoading(false);
        setTimeout(() => {
          if (importSuccess) setImportSuccess(null);
        }, 3000);
      }
    }
  };

  return (
    <div className="w-full px-4 py-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Import / Export</h1>

      {/* Tabs für Übersichtlichkeit */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-4 overflow-x-auto scrollbar-hide">
          <button
            className={`${
              activeTab === 'export'
                ? 'border-pokemon-blue text-pokemon-blue'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
            onClick={() => setActiveTab('export')}
          >
            Export
          </button>
          <button
            className={`${
              activeTab === 'import'
                ? 'border-pokemon-blue text-pokemon-blue'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
            onClick={() => setActiveTab('import')}
          >
            Import
          </button>
          <button
            className={`${
              activeTab === 'categories'
                ? 'border-pokemon-blue text-pokemon-blue'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
            onClick={() => setActiveTab('categories')}
          >
            Kategorien
          </button>
        </nav>
      </div>

      {/* Export Tab */}
      {activeTab === 'export' && (
        <div>
          <div className="mb-6 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-100">
            <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-2">Daten exportieren</h2>
            <p className="text-sm text-gray-600 mb-1">
              Exportiere deine Sammlung in verschiedenen Formaten.
            </p>
            <p className="text-xs text-gray-500 mb-3">
              <strong>Hinweis:</strong> Für vollständige Sicherungen mit Bildern nutze JSON-Export.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-4">
              <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 shadow-sm">
                <h3 className="font-medium mb-2">JSON Export</h3>
                <p className="text-xs text-gray-500 mb-3">
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
              
              <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 shadow-sm">
                <h3 className="font-medium mb-2">Excel Export (Komplett)</h3>
                <p className="text-xs text-gray-500 mb-3">
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
              <h3 className="text-sm font-medium text-gray-900 mb-3">Kategorie-Export</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {categories.map((category) => (
                  <div key={category.id} className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 shadow-sm">
                    <h4 className="font-medium mb-2 text-sm">{category.name}</h4>
                    <p className="text-xs text-gray-500 mb-3">
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
                      <button
                        onClick={() => handleCsvExport(category.id)}
                        disabled={isLoading}
                        className="w-full flex justify-center items-center px-2 py-1.5 border border-transparent rounded-md shadow-sm text-xs font-medium text-white bg-pokemon-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pokemon-blue"
                      >
                        <ArrowUpTrayIcon className="h-4 w-4 mr-1.5" />
                        Als CSV exportieren
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="mt-6 border-t border-blue-100 pt-5">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Vorlagen herunterladen</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-2">
                {categories.map((category) => (
                  <div key={category.id} className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 shadow-sm">
                    <h4 className="font-medium mb-2 text-sm">{category.name}</h4>
                    <div className="flex flex-col space-y-2">
                      <button
                        onClick={() => handleExcelTemplateDownload(category.id)}
                        disabled={isLoading}
                        className="w-full flex justify-center items-center px-2 py-1.5 border border-gray-200 rounded-md shadow-sm text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pokemon-blue"
                      >
                        <DocumentArrowDownIcon className="h-4 w-4 mr-1.5" />
                        Excel-Vorlage
                      </button>
                      <button
                        onClick={() => handleCsvTemplateDownload(category.id)}
                        disabled={isLoading}
                        className="w-full flex justify-center items-center px-2 py-1.5 border border-gray-200 rounded-md shadow-sm text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pokemon-blue"
                      >
                        <DocumentArrowDownIcon className="h-4 w-4 mr-1.5" />
                        CSV-Vorlage
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Kategorien Tab */}
      {activeTab === 'categories' && (
        <div>
          <div className="mb-6 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4">Kategorien verwalten</h2>
            
            <div className="space-y-3">
              {categories.map((category) => (
                <div 
                  key={category.id} 
                  className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-3 sm:p-4 rounded-lg border border-gray-200 shadow-sm"
                >
                  <div className="mb-2 sm:mb-0">
                    <h3 className="font-medium text-sm">{category.name}</h3>
                    <p className="text-xs text-gray-500">
                      {getItemsByCategoryId(category.id).length} Einträge
                    </p>
                  </div>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={() => toggleCategoryVisibility(category.id)}
                      className={`
                        inline-flex items-center px-2 py-1 border rounded-md text-xs font-medium
                        ${
                          hiddenCategories.includes(category.id)
                            ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                            : 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
                        }
                      `}
                    >
                      {hiddenCategories.includes(category.id) ? (
                        <>
                          <EyeSlashIcon className="h-4 w-4 mr-1" />
                          Versteckt
                        </>
                      ) : (
                        <>
                          <EyeIcon className="h-4 w-4 mr-1" />
                          Sichtbar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Import Tab */}
      {activeTab === 'import' && (
        <div>
          <div className="mb-6 p-3 sm:p-4 bg-yellow-50 rounded-lg border border-yellow-100">
            <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-2">Daten importieren</h2>
            <p className="text-sm text-gray-600 mb-1">
              Importiere deine Sammlung aus einer vorherigen Sicherung oder CSV-Datei.
            </p>
            <p className="text-xs text-gray-500 mb-3">
              <strong>Hinweis:</strong> Ein Import überschreibt eventuell vorhandene Daten. Erstelle vorher eine Sicherung!
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-4">
              <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 shadow-sm">
                <h3 className="font-medium mb-2 text-sm">JSON Import (Vollständig)</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Stellt eine komplette Sicherung inklusive Bilder wieder her.
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
              
              <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 shadow-sm">
                <h3 className="font-medium mb-2 text-sm">CSV Import</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Importiert Daten aus einer CSV-Datei in eine ausgewählte Kategorie.
                </p>
                <div className="flex flex-col space-y-2">
                  <select
                    id="category-select"
                    className="block w-full pl-3 pr-10 py-2 text-sm border-gray-300 focus:outline-none focus:ring-pokemon-blue focus:border-pokemon-blue rounded-md"
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                  >
                    <option value="">Kategorie wählen</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  
                  <label
                    htmlFor="csv-file-upload"
                    className={`${
                      !selectedCategoryId ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    } w-full inline-flex justify-center items-center px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-pokemon-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pokemon-blue`}
                  >
                    <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                    CSV Datei auswählen
                  </label>
                  <input
                    id="csv-file-upload"
                    name="csv-file-upload"
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    onChange={handleCsvImport}
                    disabled={!selectedCategoryId || isLoading}
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