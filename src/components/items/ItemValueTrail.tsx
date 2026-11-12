import React, { Suspense, lazy } from 'react';
import type { ValuePoint } from '../../types/models';
import { formatEur } from '../../utils/format';
import { formatPercent } from '../../utils/statistics';
import { trailChange } from '../../utils/valueTrail';

// Wertverlauf eines Eintrags im Bearbeiten-Dialog (#132): Wert je Stück an
// den Tagen, an denen er geändert wurde.

const CategoryHistoryChart = lazy(() =>
  import('../dashboard/DashboardCharts').then((m) => ({ default: m.CategoryHistoryChart }))
);

const SERIES = [{ key: 'value', name: 'Wert je Stück', color: '#3B4CCA' }];

const formatDay = (date: string, withYear: boolean): string =>
  new Date(`${date}T00:00:00`).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    ...(withYear ? { year: '2-digit' } : {}),
  });

const ItemValueTrail: React.FC<{ trail: ValuePoint[] | undefined }> = ({ trail }) => {
  const points = trail ?? [];
  const change = trailChange(points);
  const spansYears = points.length > 1 && points[0].date.slice(0, 4) !== points[points.length - 1].date.slice(0, 4);

  return (
    <section aria-labelledby="wertverlauf" className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-700">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h4 id="wertverlauf" className="text-sm font-medium text-gray-700 dark:text-gray-200">
          Wertverlauf je Stück
        </h4>
        {points.length >= 2 && (
          <p className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {formatEur(points[0].value)} → {formatEur(points[points.length - 1].value)}
            {change !== null && (
              <span
                className={`ml-2 font-medium ${
                  change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {formatPercent(change)}
              </span>
            )}
          </p>
        )}
      </div>
      {points.length >= 2 ? (
        <div className="mt-2 h-36">
          <Suspense fallback={<div className="h-full animate-pulse rounded bg-gray-100 dark:bg-gray-900" />}>
            <CategoryHistoryChart
              data={points.map((point) => ({ name: formatDay(point.date, spansYears), value: point.value }))}
              series={SERIES}
              dots
              legend={false}
            />
          </Suspense>
        </div>
      ) : (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Der Verlauf entsteht, sobald du den aktuellen Wert änderst. Jede Änderung wird mit ihrem Tag festgehalten.
        </p>
      )}
    </section>
  );
};

export default ItemValueTrail;
