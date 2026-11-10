import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowTopRightOnSquareIcon, CheckIcon } from '@heroicons/react/24/outline';
import { useCategoriesData, useCollectionActions, useItemsData } from '../context/CollectionContext';
import { useCatalogSettings } from '../hooks/useCatalogSettings';
import { fetchCard, formatEur, mapLimit, summarizePricing, type PriceSummary } from '../services/tcgdex';
import type { CollectionItem } from '../types/models';
import { itemProductLink } from '../utils/catalogMatch';
import { pickCatalogPrice, PRICE_BASIS_LABEL } from '../utils/catalogSettings';
import { inputClass, selectClass } from '../utils/formStyles';
import { parseDecimal } from '../utils/number';
import { daysSinceCheck, deviationPercent, formatCheckAge, isDue, sortByCheckAge } from '../utils/priceCheck';

// Preis-Check (#125): arbeitet die Einträge mit dem ältesten Preisstand ab.
// Der maßgebliche Wert kommt weiterhin vom Nutzer (über seinen Cardmarket-Link
// mit Filtern); der Katalogpreis steht nur als Vergleich daneben.

const openExternal = (url: string) => {
  if (window.electronAPI?.openExternalURL) void window.electronAPI.openExternalURL(url);
  else window.open(url, '_blank', 'noopener');
};

const PAGE_SIZE = 25;

const PriceCheck: React.FC = () => {
  const items = useItemsData();
  const categories = useCategoriesData();
  const { updateItem, markValueChecked } = useCollectionActions();
  const settings = useCatalogSettings();

  const [categoryId, setCategoryId] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, PriceSummary | null>>({});

  // Reihenfolge beim Öffnen einfrieren: Ein gerade geprüfter Eintrag soll nicht
  // unter den Fingern wegspringen, sondern als erledigt stehen bleiben.
  const [order, setOrder] = useState<string[] | null>(null);
  useEffect(() => {
    if (order === null && items.length > 0) setOrder(sortByCheckAge(items).map((i) => i.id));
  }, [items, order]);

  const now = useMemo(() => new Date(), []);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const rows = useMemo(() => {
    const list = (order ?? []).map((id) => byId.get(id)).filter((i): i is CollectionItem => Boolean(i));
    return list.filter(
      (i) => (!categoryId || i.categoryId === categoryId) && (showAll || isDue(i, settings.dueAfterDays, now) || i.id in drafts || wasChecked(i, now))
    );
    // drafts bewusst nicht als Abhängigkeit: es dient nur dazu, bearbeitete Zeilen sichtbar zu halten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, byId, categoryId, showAll, settings.dueAfterDays, now]);

  const dueCount = useMemo(
    () => items.filter((i) => (!categoryId || i.categoryId === categoryId) && isDue(i, settings.dueAfterDays)).length,
    [items, categoryId, settings.dueAfterDays]
  );

  const visible = rows.slice(0, limit);

  // Katalogpreise der sichtbaren, verknüpften Einträge nachladen (12 h Cache im Service).
  const visibleKey = visible.map((i) => i.catalog?.cardId ?? '').join('|');
  useEffect(() => {
    let alive = true;
    const missing = [...new Set(visible.map((i) => i.catalog?.cardId).filter((id): id is string => Boolean(id)))].filter(
      (id) => !(id in prices)
    );
    if (missing.length === 0) return;
    void mapLimit(missing, 6, async (cardId) => {
      const summary = await fetchCard(cardId).then(summarizePricing, () => null);
      if (alive) setPrices((prev) => ({ ...prev, [cardId]: summary }));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey]);

  const save = (item: CollectionItem) => {
    const value = parseDecimal(drafts[item.id] ?? '');
    if (!Number.isFinite(value) || value < 0) return;
    if (value === Number(item.values?.currentValue)) markValueChecked(item.id);
    else updateItem(item.id, { currentValue: value });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
  };

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="py-6">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Preis-Check</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Einträge mit dem ältesten Preisstand zuerst. Öffne den Link und lies den Preis ab. Hat er sich geändert,
          trage den neuen Wert ein und speichere; ist er gleich geblieben, genügt „Stimmt noch“.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setLimit(PAGE_SIZE);
            }}
            aria-label="Kategorie"
            className={`${selectClass} sm:w-56`}
          >
            <option value="">Alle Kategorien</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-pokemon-blue focus:ring-pokemon-blue"
            />
            Auch aktuelle Preise zeigen
          </label>
          <span className="text-sm text-gray-700 dark:text-gray-200 tabular-nums sm:ml-auto" aria-live="polite">
            {dueCount} fällig (älter als {settings.dueAfterDays} Tage) ·{' '}
            <Link to="/settings" className="text-pokemon-blue dark:text-blue-300 hover:underline">
              ändern
            </Link>
          </span>
        </div>

        {items.length > 0 && rows.length === 0 && (
          <p className="mt-8 rounded-lg bg-white dark:bg-gray-800 shadow p-6 text-sm text-gray-600 dark:text-gray-300">
            Alle Preise sind aktuell. 🎉
          </p>
        )}
        {items.length === 0 && (
          <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">Noch keine Einträge in der Sammlung.</p>
        )}

        <ul className="mt-6 space-y-2">
          {visible.map((item) => {
            const link = itemProductLink(item);
            const days = daysSinceCheck(item, now);
            const checkedNow = wasChecked(item, now);
            const summary = item.catalog ? prices[item.catalog.cardId] : undefined;
            const catalogPrice = pickCatalogPrice(summary, settings.priceBasis, item.catalog?.variant);
            const deviation = deviationPercent(item.values?.currentValue, catalogPrice);
            const name = String(item.values?.name ?? 'Ohne Namen');
            return (
              <li
                key={item.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-white dark:bg-gray-800 shadow px-4 py-3 ${
                  checkedNow ? 'opacity-60' : ''
                }`}
              >
                <div className="min-w-0 flex-1 basis-56">
                  <Link
                    to={`/category/${item.categoryId}?highlight=${item.id}`}
                    className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100 hover:underline"
                  >
                    {name}
                  </Link>
                  <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {categoryName(item.categoryId)}
                    {item.values?.expansion ? ` · ${item.values.expansion}` : ''} ·{' '}
                    <span className={days === null || days >= settings.dueAfterDays ? 'text-amber-600 dark:text-amber-400' : ''}>
                      {formatCheckAge(days)}
                    </span>
                  </div>
                </div>

                <div className="w-28 text-right tabular-nums">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {formatEur(Number(item.values?.currentValue) || 0)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">dein Wert</div>
                </div>

                <div className="w-36 text-right tabular-nums">
                  {item.catalog ? (
                    <>
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {summary === undefined ? '…' : formatEur(catalogPrice)}
                        {deviation !== null && Math.abs(deviation) >= 10 && (
                          <span
                            className={`ml-1 text-xs ${deviation > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                          >
                            {deviation > 0 ? '+' : ''}
                            {deviation} %
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Katalog · {PRICE_BASIS_LABEL[settings.priceBasis]}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-gray-400 dark:text-gray-500">nicht verknüpft</div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => link && openExternal(link)}
                    disabled={!link}
                    title={link ? 'Cardmarket-Link öffnen' : 'Kein Link hinterlegt'}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" /> Link
                  </button>
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      save(item);
                    }}
                  >
                    <input
                      type="text"
                      inputMode="decimal"
                      value={drafts[item.id] ?? ''}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      placeholder="neuer Wert"
                      aria-label={`Neuer Wert für ${name}`}
                      className={`${inputClass} w-28 text-right`}
                    />
                    <button
                      type="submit"
                      disabled={!Number.isFinite(parseDecimal(drafts[item.id] ?? ''))}
                      className="rounded-md bg-pokemon-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
                    >
                      Speichern
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={() => markValueChecked(item.id)}
                    title="Wert unverändert lassen und als heute geprüft vermerken"
                    aria-label={`Preis von ${name} stimmt noch`}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:border-green-500 hover:text-green-600"
                  >
                    <CheckIcon className="h-4 w-4" /> Stimmt noch
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {rows.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((n) => n + PAGE_SIZE)}
            className="mt-4 rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Weitere {Math.min(PAGE_SIZE, rows.length - limit)} anzeigen ({rows.length - limit} übrig)
          </button>
        )}
      </div>
    </div>
  );
};

/** In dieser Sitzung (seit dem Öffnen der Seite) geprüft? */
const wasChecked = (item: CollectionItem, openedAt: Date) =>
  Boolean(item.valueCheckedAt) && Date.parse(item.valueCheckedAt as string) >= openedAt.getTime();

export default PriceCheck;
