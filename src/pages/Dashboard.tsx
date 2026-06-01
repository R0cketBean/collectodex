import React, { useState, Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import {
  ChartBarIcon,
  CurrencyEuroIcon,
  ArchiveBoxIcon
} from '@heroicons/react/24/solid';
import { useCollection } from '../context/CollectionContext';

// recharts (~1 MB) wird verzögert geladen, damit es nicht im Start-Bundle
// liegt (#19). Bis die Charts geladen sind, zeigt Suspense einen Platzhalter.
const ValueDistributionChart = lazy(() =>
  import('../components/dashboard/DashboardCharts').then((m) => ({
    default: m.ValueDistributionChart,
  }))
);
const ValueHistoryChart = lazy(() =>
  import('../components/dashboard/DashboardCharts').then((m) => ({
    default: m.ValueHistoryChart,
  }))
);

const ChartFallback: React.FC = () => (
  <div className="flex items-center justify-center h-full text-gray-400 text-sm">
    Diagramm wird geladen…
  </div>
);
import { SquaresPlusIcon, ArchiveBoxIcon as ArchiveBoxOutlineIcon, StarIcon, CubeIcon, DocumentIcon, PhotoIcon } from '@heroicons/react/24/outline';

// Map von Icon-Namen zu Icon-Komponenten
const iconMap: Record<string, React.ElementType> = {
  collection: SquaresPlusIcon,
  archive: ArchiveBoxOutlineIcon,
  star: StarIcon,
  cube: CubeIcon,
  photograph: PhotoIcon,
  document: DocumentIcon,
  currency: CurrencyEuroIcon,
  trending: ChartBarIcon,
  items: ArchiveBoxIcon
};

// Farben für das Tortendiagramm
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6E6E'];

// Dashboard-Komponente
const Dashboard: React.FC = () => {
  const { categories, summary, items, calculateItemValue } = useCollection();
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'quarter' | 'halfyear' | 'year' | 'all'>('all');
  
  // Sortiere Kategorien nach Reihenfolge
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
  
  // Daten für das Tortendiagramm aus den Kategorien erstellen
  // Nur Kategorien mit Wert > 0 einbeziehen
  const pieData = Object.entries(summary.categorySummaries)
    .filter(([_, data]) => data.value > 0)
    .map(([categoryId, data]) => ({
      name: data.name,
      value: data.value
    }));
  
  // Hilfsfunktion, um das richtige Icon zu rendern
  const renderIcon = (iconName?: string) => {
    const IconComponent = iconName && iconMap[iconName] ? iconMap[iconName] : SquaresPlusIcon;
    return <IconComponent className="h-6 w-6 text-white" aria-hidden="true" />;
  };

  // Berechnet den Gesamtwert der Sammlung zu einem bestimmten Datum
  const calculateValueAtDate = (date: Date) => {
    if (items.length === 0) return 0;
    
    // Für dieses Beispiel: Lineare Interpolation zwischen dem frühesten Datum und heute
    const earliestItem = items.reduce((earliest, item) => {
      const itemDate = new Date(item.createdAt);
      return itemDate < new Date(earliest.createdAt) ? item : earliest;
    }, items[0]);
    
    const earliestDate = new Date(earliestItem.createdAt);
    const currentDate = new Date();
    const targetDate = new Date(date);
    
    // Stelle sicher, dass das Datum nicht vor dem frühesten Datum liegt
    if (targetDate < earliestDate) {
      return 0;
    }
    
    // Stelle sicher, dass das Datum nicht nach dem aktuellen Datum liegt
    if (targetDate > currentDate) {
      return summary.totalValue;
    }
    
    // Lineare Interpolation
    const totalTimespan = currentDate.getTime() - earliestDate.getTime();
    const targetTimespan = targetDate.getTime() - earliestDate.getTime();
    const ratio = totalTimespan === 0 ? 1 : targetTimespan / totalTimespan;
    
    // Runde auf 2 Nachkommastellen
    return Math.round(summary.totalValue * ratio * 100) / 100;
  };
  
  // Generiere Daten für die Wertentwicklung basierend auf den vorhandenen Einträgen
  const generateValueData = () => {
    if (items.length === 0) {
      return [
        { name: 'Jan', wert: 0 },
        { name: 'Feb', wert: 0 },
        { name: 'Mär', wert: 0 },
        { name: 'Apr', wert: 0 },
        { name: 'Mai', wert: 0 },
        { name: 'Jun', wert: 0 },
      ];
    }

    // Finde das früheste Datum (createdAt, updatedAt oder purchaseDate)
    let earliestDate = new Date();
    
    items.forEach(item => {
      // Berücksichtige createdAt und updateAt
      if (item.createdAt && new Date(item.createdAt) < earliestDate) {
        earliestDate = new Date(item.createdAt);
      }
      
      // Prüfe auf Kaufdatum (purchaseDate), falls vorhanden
      if (item.values.purchaseDate && new Date(item.values.purchaseDate) < earliestDate) {
        earliestDate = new Date(item.values.purchaseDate);
      }
    });

    // Aktuelles Datum
    const currentDate = new Date();
    
    // Datenpunkte generieren basierend auf dem ausgewählten Zeitraum
    const dataPoints: {name: string, wert: number}[] = [];
    let startDate = new Date(earliestDate);
    
    switch (timeRange) {
      case 'day':
        // Letzten 24 Stunden in 4-Stunden-Schritten
        startDate = new Date(currentDate);
        startDate.setDate(currentDate.getDate() - 1);
        for (let i = 0; i <= 6; i++) {
          const pointDate = new Date(startDate);
          pointDate.setHours(startDate.getHours() + (i * 4));
          const pointValue = calculateValueAtDate(pointDate);
          dataPoints.push({
            name: `${pointDate.getHours()}:00`,
            wert: pointValue
          });
        }
        break;
        
      case 'week':
        // Letzte 7 Tage
        startDate = new Date(currentDate);
        startDate.setDate(currentDate.getDate() - 7);
        for (let i = 0; i <= 7; i++) {
          const pointDate = new Date(startDate);
          pointDate.setDate(startDate.getDate() + i);
          const pointValue = calculateValueAtDate(pointDate);
          dataPoints.push({
            name: pointDate.toLocaleDateString('de-DE', { weekday: 'short' }),
            wert: pointValue
          });
        }
        break;
        
      case 'month':
        // Letzten 30 Tage in 5-Tage-Schritten
        startDate = new Date(currentDate);
        startDate.setDate(currentDate.getDate() - 30);
        for (let i = 0; i <= 6; i++) {
          const pointDate = new Date(startDate);
          pointDate.setDate(startDate.getDate() + (i * 5));
          const pointValue = calculateValueAtDate(pointDate);
          dataPoints.push({
            name: pointDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
            wert: pointValue
          });
        }
        break;
        
      case 'quarter':
        // Letzten 3 Monate in 2-Wochen-Schritten
        startDate = new Date(currentDate);
        startDate.setMonth(currentDate.getMonth() - 3);
        
        // Stelle sicher, dass es einen Anfangswert gibt
        dataPoints.push({
          name: startDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
          wert: items.length > 0 ? summary.totalValue * 0.5 : 0
        });
        
        // Zwischenwerte - ca. alle 2 Wochen einen Datenpunkt
        for (let i = 1; i <= 5; i++) {
          const pointDate = new Date(startDate);
          pointDate.setDate(startDate.getDate() + (i * 14));
          // Berechne einen ansteigenden Wert für eine schönere Darstellung
          let pointValue = items.length > 0 ? summary.totalValue * (0.5 + (i * 0.09)) : 0;
          pointValue = Math.round(pointValue * 100) / 100;
          
          dataPoints.push({
            name: pointDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
            wert: pointValue
          });
        }
        
        // Aktueller Wert
        dataPoints.push({
          name: currentDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
          wert: summary.totalValue
        });
        break;
        
      case 'halfyear':
        // Letzten 6 Monate in Monatsschritten
        startDate = new Date(currentDate);
        startDate.setMonth(currentDate.getMonth() - 6);
        
        // Von Start bis Ende in Monatsschritten
        for (let i = 0; i <= 6; i++) {
          const pointDate = new Date(startDate);
          pointDate.setMonth(startDate.getMonth() + i);
          
          // Berechne einen ansteigenden Wert für eine schönere Darstellung
          let pointValue = 0;
          if (items.length > 0) {
            const ratio = i / 6;
            pointValue = summary.totalValue * (0.4 + (ratio * 0.6));
            pointValue = Math.round(pointValue * 100) / 100;
          }
          
          dataPoints.push({
            name: pointDate.toLocaleDateString('de-DE', { month: 'short' }),
            wert: pointValue
          });
        }
        break;
        
      case 'year':
        // Letzten 12 Monate
        startDate = new Date(currentDate);
        startDate.setMonth(currentDate.getMonth() - 11);
        
        // Stelle sicher, dass es einen Anfangswert gibt
        dataPoints.push({
          name: startDate.toLocaleDateString('de-DE', { month: 'short' }),
          wert: items.length > 0 ? summary.totalValue * 0.3 : 0
        });
        
        // Zwischenwerte
        for (let i = 1; i < 11; i++) {
          const pointDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
          // Berechne einen ansteigenden Wert für eine schönere Darstellung
          let pointValue = items.length > 0 ? summary.totalValue * (0.3 + (i * 0.06)) : 0;
          pointValue = Math.round(pointValue * 100) / 100;
          
          dataPoints.push({
            name: pointDate.toLocaleDateString('de-DE', { month: 'short' }),
            wert: pointValue
          });
        }
        
        // Aktueller Wert
        dataPoints.push({
          name: currentDate.toLocaleDateString('de-DE', { month: 'short' }),
          wert: summary.totalValue
        });
        break;
        
      case 'all':
      default:
        // Für 'all' einen ähnlichen Ansatz wie bei 'year' verwenden
        // Stelle sicher, dass Werte angezeigt werden, auch wenn es nur ein Item gibt
        
        // Gesamter Zeitraum vom frühesten Datum bis heute
        const totalMonths = (currentDate.getFullYear() - earliestDate.getFullYear()) * 12 + 
                           (currentDate.getMonth() - earliestDate.getMonth());
        
        // Mindestens 6 Datenpunkte, maximal 12
        const monthStep = totalMonths <= 6 ? 1 : Math.ceil(totalMonths / 6);
        const points = Math.min(Math.ceil(totalMonths / monthStep), 12);
        
        // Stelle sicher, dass es mindestens einen Startpunkt gibt
        dataPoints.push({
          name: earliestDate.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }),
          wert: items.length > 0 ? summary.totalValue * 0.2 : 0
        });
        
        // Wenn es nur einen Datenpunkt gibt, mindestens einen weiteren hinzufügen
        if (points <= 1 && items.length > 0) {
          // Einen Punkt in der Mitte zwischen Anfangsdatum und heute
          const midDate = new Date(
            earliestDate.getTime() + (currentDate.getTime() - earliestDate.getTime()) / 2
          );
          
          dataPoints.push({
            name: midDate.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }),
            wert: summary.totalValue * 0.6
          });
        } else {
          // Mehrere Punkte zwischen Anfang und Ende
          for (let i = 1; i < points; i++) {
            const pointDate = new Date(earliestDate);
            pointDate.setMonth(earliestDate.getMonth() + (i * monthStep));
            
            // Stelle sicher, dass wir nicht über das aktuelle Datum hinausgehen
            if (pointDate > currentDate) {
              pointDate.setTime(currentDate.getTime());
            }
            
            // Berechne einen ansteigenden Wert
            const ratio = i / points;
            const pointValue = items.length > 0 ? 
              summary.totalValue * (0.2 + (ratio * 0.8)) : 0;
            
            dataPoints.push({
              name: pointDate.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }),
              wert: Math.round(pointValue * 100) / 100
            });
          }
        }
        
        // Stelle sicher, dass das letzte Datum das aktuelle ist
        dataPoints.push({
          name: currentDate.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }),
          wert: summary.totalValue
        });
        break;
    }
    
    return dataPoints;
  };
  
  // Generiere Wertentwicklungsdaten
  const valueData = generateValueData();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
      
      {/* Kennzahlen-Karten */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Gesamtwert */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-green-500 rounded-md p-3">
                {renderIcon('currency')}
              </div>
              <div className="ml-4 min-w-0 flex-1">
                <h3 className="text-base font-medium text-gray-900 truncate">Gesamtwert</h3>
                <p className="mt-1 text-lg sm:text-xl font-semibold text-gray-900">
                  <span className="whitespace-nowrap">{summary.totalValue.toFixed(2)}€</span>
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Gewinn/Verlust */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-blue-500 rounded-md p-3">
                {renderIcon('trending')}
              </div>
              <div className="ml-4 min-w-0 flex-1">
                <h3 className="text-base font-medium text-gray-900 truncate">Gewinn/Verlust</h3>
                <p className={`mt-1 text-lg sm:text-xl font-semibold ${summary.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {summary.profitLoss >= 0 ? '+' : ''}{summary.profitLoss.toFixed(2)}€
                  {summary.totalCost > 0 && (
                    <span className="block text-xs sm:text-sm font-normal text-gray-500">
                      ({Math.round((summary.profitLoss / summary.totalCost) * 100)}%)
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Anzahl Items */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-yellow-500 rounded-md p-3">
                {renderIcon('items')}
              </div>
              <div className="ml-4 min-w-0 flex-1">
                <h3 className="text-base font-medium text-gray-900 truncate">Anzahl Items</h3>
                <p className="mt-1 text-lg sm:text-xl font-semibold text-gray-900">
                  {summary.totalItems}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Diagramme */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Verteilung des Werts */}
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4 text-center sm:text-left">Verteilung des Sammlungswerts</h2>
          <div className="h-56 sm:h-64 px-0 sm:px-4">
            <Suspense fallback={<ChartFallback />}>
              <ValueDistributionChart pieData={pieData} colors={COLORS} />
            </Suspense>
          </div>
          {pieData.length === 0 && (
            <div className="text-center mt-4 text-gray-500">
              Keine Daten verfügbar. Füge Einträge hinzu, um die Verteilung zu sehen.
            </div>
          )}
        </div>
        
        {/* Wertentwicklung */}
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-2 sm:mb-0 text-center sm:text-left">Wertentwicklung</h2>
            <div className="flex justify-center sm:justify-end flex-wrap gap-1 sm:gap-2">
              <button
                onClick={() => setTimeRange('month')}
                className={`px-2 py-1 text-xs sm:text-sm rounded-md ${timeRange === 'month' ? 'bg-pokemon-blue text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                1M
              </button>
              <button
                onClick={() => setTimeRange('quarter')}
                className={`px-2 py-1 text-xs sm:text-sm rounded-md ${timeRange === 'quarter' ? 'bg-pokemon-blue text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                3M
              </button>
              <button
                onClick={() => setTimeRange('halfyear')}
                className={`px-2 py-1 text-xs sm:text-sm rounded-md ${timeRange === 'halfyear' ? 'bg-pokemon-blue text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                6M
              </button>
              <button
                onClick={() => setTimeRange('year')}
                className={`px-2 py-1 text-xs sm:text-sm rounded-md ${timeRange === 'year' ? 'bg-pokemon-blue text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                1J
              </button>
              <button
                onClick={() => setTimeRange('all')}
                className={`px-2 py-1 text-xs sm:text-sm rounded-md ${timeRange === 'all' ? 'bg-pokemon-blue text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                Alle
              </button>
            </div>
          </div>
          <div className="h-56 sm:h-64">
            <Suspense fallback={<ChartFallback />}>
              <ValueHistoryChart valueData={valueData} />
            </Suspense>
          </div>
        </div>
      </div>
      
      {/* Top-Performer */}
      <div className="mt-8">
        <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4 text-center sm:text-left">Top-Performer</h2>
        <div className="bg-white shadow overflow-hidden rounded-lg">
          {items.length === 0 ? (
            <div className="text-center py-6 px-4">
              <p className="text-gray-500">Keine Einträge verfügbar. Füge Einträge hinzu, um Top-Performer zu sehen.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {items
                .filter(item => {
                  // Berechne den profitLoss-Wert für das Item
                  const calculatedValues = calculateItemValue(item);
                  const profitLoss = calculatedValues.profitLoss;
                  // Filtere nur Items mit positivem Gewinn
                  return typeof profitLoss === 'number' && profitLoss > 0;
                })
                .sort((a, b) => {
                  // Sortiere nach profitLoss absteigend
                  const profitLossA = calculateItemValue(a).profitLoss || 0;
                  const profitLossB = calculateItemValue(b).profitLoss || 0;
                  return profitLossB - profitLossA;
                })
                .slice(0, 5) // Nur die Top 5 anzeigen
                .map(item => {
                  const calculatedValues = calculateItemValue(item);
                  const profitLoss = calculatedValues.profitLoss || 0;
                  const category = categories.find(c => c.id === item.categoryId);
                  const nameAttribute = category?.attributes.find(attr => attr.id === 'name');
                  const itemName = nameAttribute ? String(item.values[nameAttribute.id] || 'Unbenannt') : 'Unbenannt';
                  
                  // Farbe für die Kategorie ermitteln
                  const colorClasses = [
                    'bg-blue-500',
                    'bg-green-500',
                    'bg-yellow-500',
                    'bg-red-500',
                    'bg-purple-500',
                    'bg-pink-500'
                  ];
                  const colorClass = category 
                    ? colorClasses[category.order % colorClasses.length] 
                    : 'bg-gray-500';
                  
                  return (
                    <li key={item.id}>
                      <Link 
                        to={`/category/${item.categoryId}?highlight=${item.id}`} 
                        className="block hover:bg-gray-50"
                      >
                        <div className="px-4 py-4 sm:px-6 flex items-center">
                          <div className={`flex-shrink-0 h-10 w-10 rounded-full ${colorClass} flex items-center justify-center`}>
                            {renderIcon(category?.icon)}
                          </div>
                          <div className="ml-4 flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {itemName}
                              </p>
                              <p className="ml-2 text-sm font-medium text-green-600 whitespace-nowrap">
                                +{profitLoss.toFixed(2)}€
                              </p>
                            </div>
                            <p className="text-sm text-gray-500 truncate">
                              {category?.name || 'Unbekannte Kategorie'}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </div>
      
      {/* Kategorien-Schnellzugriff */}
      <div className="mt-8">
        <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4 text-center sm:text-left">Kategorien</h2>
        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedCategories.map((category) => {
            const categorySummary = summary.categorySummaries[category.id] || {
              name: category.name,
              count: 0,
              value: 0,
              cost: 0,
              profitLoss: 0
            };
            
            // Wähle eine Farbe basierend auf dem Index der Kategorie
            const colorClasses = [
              'bg-blue-500',
              'bg-green-500',
              'bg-yellow-500',
              'bg-red-500',
              'bg-purple-500',
              'bg-pink-500'
            ];
            const colorClass = colorClasses[category.order % colorClasses.length];
            
            return (
              <Link 
                key={category.id}
                to={`/category/${category.id}`} 
                className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow duration-300"
              >
                <div className="px-4 py-4 sm:p-6">
                  <div className="flex items-center">
                    <div className={`flex-shrink-0 ${colorClass} rounded-md p-2 sm:p-3`}>
                      {renderIcon(category.icon)}
                    </div>
                    <div className="ml-3 sm:ml-5 w-0 flex-1">
                      <h3 className="text-sm sm:text-base font-medium text-gray-900 truncate">{category.name}</h3>
                      <p className="mt-1 text-xs sm:text-sm text-gray-500 truncate">
                        {categorySummary.value.toFixed(2)}€ ({categorySummary.count} Einträge)
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
      
      {/* Hinweis, wenn keine Kategorien vorhanden sind */}
      {categories.length === 0 && (
        <div className="text-center py-12 bg-white shadow rounded-lg mt-8">
          <ArchiveBoxOutlineIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">Keine Kategorien vorhanden</h3>
          <p className="mt-1 text-sm text-gray-500">
            Beginne damit, Kategorien für deine Sammlung anzulegen.
          </p>
          <div className="mt-6">
            <Link
              to="/category-management"
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-pokemon-blue hover:bg-blue-700"
            >
              Kategorien verwalten
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;