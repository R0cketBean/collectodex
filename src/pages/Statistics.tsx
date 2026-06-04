import React, { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import {
  useItemsData,
  useCategoriesData,
  useDerived,
  useCollectionActions,
} from '../context/CollectionContext';
import {
  holdingDays,
  roi,
  annualizedReturn,
  averageHoldingDays,
  formatHoldingDuration,
  formatPercent,
} from '../utils/statistics';

// recharts verzögert laden (#19), wie auf dem Dashboard.
const CategoryHistoryChart = lazy(() =>
  import('../components/dashboard/DashboardCharts').then((m) => ({
    default: m.CategoryHistoryChart,
  }))
);

const ChartFallback: React.FC = () => (
  <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
    Diagramm wird geladen…
  </div>
);

// Feste Hex-Palette für die Kategorie-Linien (recharts braucht Hex, keine
// Tailwind-Klassen).
const CHART_COLORS = ['#3B4CCA', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6E6E'];

interface ItemStat {
  id: string;
  name: string;
  categoryName: string;
  cost: number;
  value: number;
  profit: number;
  days: number | null;
  roiFrac: number | null;
  paFrac: number | null;
}

const Statistics: React.FC = () => {
  const items = useItemsData();
  const categories = useCategoriesData();
  const { summary, valueHistory } = useDerived();
  const { calculateItemValue } = useCollectionActions();

  const now = new Date();

  // Pro Position Kennzahlen berechnen.
  const itemStats: ItemStat[] = items.map((item) => {
    const calc = calculateItemValue(item);
    const cost = Number(calc.totalCost) || 0;
    const value = Number(calc.totalValue) || 0;
    const days = holdingDays(item.values.addedDate as string | undefined, now);
    const category = categories.find((c) => c.id === item.categoryId);
    const nameAttr = category?.attributes.find((a) => a.id === 'name');
    const name = nameAttr ? String(item.values[nameAttr.id] || 'Unbenannt') : 'Unbenannt';
    return {
      id: item.id,
      name,
      categoryName: category?.name || 'Unbekannt',
      cost,
      value,
      profit: value - cost,
      days,
      roiFrac: roi(cost, value),
      paFrac: annualizedReturn(cost, value, days),
    };
  });

  // Kennzahlen.
  const avgDays = averageHoldingDays(
    items.map((i) => holdingDays(i.values.addedDate as string | undefined, now))
  );
  const overallRoi = roi(summary.totalCost, summary.totalValue);

  // Rangliste nach Rendite-% (nur Positionen mit gültiger Rendite).
  const ranked = itemStats
    .filter((s) => s.roiFrac != null)
    .sort((a, b) => (b.roiFrac as number) - (a.roiFrac as number));
  const top = ranked.slice(0, 5);
  const flop = ranked.length > 5 ? ranked.slice(5).slice(-5).reverse() : [];

  // Wertverlauf je Kategorie aus den gespeicherten Snapshots.
  const sortedHistory = [...valueHistory].sort((a, b) => a.date.localeCompare(b.date));
  const activeCategories = categories.filter((c) =>
    sortedHistory.some((s) => (s.categories?.[c.id]?.value ?? 0) > 0)
  );
  const series = activeCategories.map((c, i) => ({
    key: c.id,
    name: c.name,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
  const chartData = sortedHistory.map((s) => {
    const row: Record<string, number | string> = {
      name: new Date(`${s.date}T00:00:00`).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
      }),
    };
    for (const c of activeCategories) {
      row[c.id] = s.categories?.[c.id]?.value ?? 0;
    }
    return row;
  });
  const historyTooSparse = chartData.length < 2;

  const profitColor = (v: number) =>
    v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  const StatCard: React.FC<{ label: string; value: string; hint?: string; valueClass?: string }> = ({
    label,
    value,
    hint,
    valueClass,
  }) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{label}</h3>
        <p className={`mt-1 text-xl font-semibold ${valueClass || 'text-gray-900 dark:text-gray-100'}`}>
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
      </div>
    </div>
  );

  const PerformanceList: React.FC<{ title: string; rows: ItemStat[]; empty: string }> = ({
    title,
    rows,
    empty,
  }) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <h3 className="px-4 sm:px-6 pt-4 text-base font-medium text-gray-900 dark:text-gray-100">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="px-4 sm:px-6 py-6 text-sm text-gray-500 dark:text-gray-400">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-200 dark:divide-gray-700">
          {rows.map((s) => (
            <li key={s.id} className="px-4 sm:px-6 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {s.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {s.categoryName} · Haltedauer {formatHoldingDuration(s.days)}
                    {s.paFrac != null && <> · {formatPercent(s.paFrac)} p.a.</>}
                  </p>
                </div>
                <div className="text-right whitespace-nowrap">
                  <p className={`text-sm font-semibold ${profitColor(s.roiFrac ?? 0)}`}>
                    {formatPercent(s.roiFrac)}
                  </p>
                  <p className={`text-xs ${profitColor(s.profit)}`}>
                    {s.profit >= 0 ? '+' : ''}
                    {s.profit.toFixed(2)}€
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Statistik</h1>

      {items.length === 0 ? (
        <div className="mt-6 text-center py-12 bg-white dark:bg-gray-800 shadow rounded-lg">
          <p className="text-gray-500 dark:text-gray-400">
            Noch keine Einträge. Füge Einträge hinzu, um Auswertungen zu sehen.
          </p>
          <div className="mt-4">
            <Link
              to="/"
              className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-pokemon-blue hover:bg-blue-700"
            >
              Zum Dashboard
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Kennzahlen */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Investiert" value={`${summary.totalCost.toFixed(2)}€`} />
            <StatCard label="Aktueller Wert" value={`${summary.totalValue.toFixed(2)}€`} />
            <StatCard
              label="Gewinn/Verlust"
              value={`${summary.profitLoss >= 0 ? '+' : ''}${summary.profitLoss.toFixed(2)}€`}
              hint={overallRoi != null ? `${formatPercent(overallRoi)} Gesamtrendite` : undefined}
              valueClass={profitColor(summary.profitLoss)}
            />
            <StatCard
              label="Ø Haltedauer"
              value={formatHoldingDuration(avgDays)}
              hint='aus "Gekauft am"'
            />
          </div>

          {/* Wertverlauf pro Kategorie */}
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-3 sm:mb-4">
              Wertverlauf pro Kategorie
            </h2>
            <div className="h-64 sm:h-72">
              <Suspense fallback={<ChartFallback />}>
                <CategoryHistoryChart data={chartData} series={series} />
              </Suspense>
            </div>
            {historyTooSparse && (
              <div className="text-center mt-4 text-sm text-gray-500 dark:text-gray-400">
                Die Wert-Historie wird ab jetzt täglich aufgebaut – die Kurven füllen sich mit der
                Zeit.
              </div>
            )}
          </div>

          {/* Top / Flop nach Rendite */}
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <PerformanceList
              title="Beste Rendite"
              rows={top}
              empty="Noch keine Positionen mit Kaufpreis."
            />
            <PerformanceList
              title="Schwächste Rendite"
              rows={flop}
              empty="Zu wenige Positionen für einen Vergleich."
            />
          </div>
        </>
      )}
    </div>
  );
};

export default Statistics;
