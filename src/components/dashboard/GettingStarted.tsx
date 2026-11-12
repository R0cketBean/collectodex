import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { useCategoriesData, useItemsData } from '../../context/CollectionContext';
import { useCatalogOwned } from '../../hooks/useCatalogOwned';
import { loadBackupSettings } from '../../utils/backupSettings';
import { onboardingSteps, readOnboardingState, showOnboarding, writeOnboardingState } from '../../utils/onboarding';

// „Erste Schritte“ auf dem Dashboard (#129). Erledigte Schritte haken sich
// selbst ab; sind alle erledigt oder blendet der Nutzer die Karte aus,
// erscheint sie nicht mehr.
const GettingStarted: React.FC = () => {
  const categories = useCategoriesData();
  const items = useItemsData();
  const owned = useCatalogOwned();
  const [state, setState] = useState(readOnboardingState);
  // Bis die Sicherungs-Einstellungen gelesen sind, bleibt die Karte weg – so
  // blitzt sie bei eingerichteten Sammlungen nicht kurz auf.
  const [backupReady, setBackupReady] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void loadBackupSettings().then(
      (s) => alive && setBackupReady(Boolean(s.enabled && s.folder)),
      () => alive && setBackupReady(false)
    );
    return () => {
      alive = false;
    };
  }, []);

  const steps = useMemo(
    () =>
      onboardingSteps({
        categories,
        itemCount: items.length,
        catalogUsed: Object.keys(owned).length > 0 || items.some((i) => i.catalog),
        backupReady: backupReady === true,
        categoriesSeen: state.categoriesSeen,
      }),
    [categories, items, owned, backupReady, state.categoriesSeen]
  );

  // Ohne Kategorien sind die Daten noch nicht geladen (danach gibt es mindestens die Vorgaben).
  if (categories.length === 0 || backupReady === null || !showOnboarding(steps, state)) return null;

  const update = (patch: Partial<typeof state>) => {
    const next = { ...state, ...patch };
    writeOnboardingState(next);
    setState(next);
  };
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section
      aria-labelledby="erste-schritte"
      className="mt-6 rounded-lg bg-white dark:bg-gray-800 shadow p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="erste-schritte" className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100">
            Erste Schritte
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {doneCount} von {steps.length} erledigt. Die Reihenfolge ist nur ein Vorschlag.
          </p>
        </div>
        <button
          type="button"
          onClick={() => update({ dismissed: true })}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:underline"
        >
          Ausblenden
        </button>
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={`flex flex-col rounded-md border p-4 ${
              step.done
                ? 'border-green-200 dark:border-green-900 bg-green-50/60 dark:bg-green-900/10'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <div className="flex items-center gap-2">
              {step.done ? (
                <CheckCircleIcon className="h-6 w-6 flex-shrink-0 text-green-500" aria-hidden="true" />
              ) : (
                <span
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-600 dark:text-gray-300 tabular-nums"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
              )}
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {step.title}
                {step.done && <span className="sr-only"> (erledigt)</span>}
              </h3>
            </div>
            <p className="mt-2 flex-1 text-sm text-gray-500 dark:text-gray-400">{step.text}</p>
            <Link
              to={step.href}
              onClick={() => step.id === 'categories' && update({ categoriesSeen: true })}
              className="mt-3 text-sm font-medium text-pokemon-blue dark:text-blue-300 hover:underline"
            >
              {step.action}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
};

export default GettingStarted;
