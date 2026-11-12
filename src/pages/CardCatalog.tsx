import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { inputClass, primaryButtonSmallClass } from '../utils/formStyles';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import FallbackImage from '../components/catalog/FallbackImage';
import { useCategoriesData, useItemsData } from '../context/CollectionContext';
import { useCatalogOwned } from '../hooks/useCatalogOwned';
import { CATALOG_LANGUAGES, fetchCatalog, normalizeSearch, setLogoSources, type SerieDetail } from '../services/tcgdex';
import { updateCatalogSettings, useCatalogSettings } from '../hooks/useCatalogSettings';
import { linkCategoryIds } from '../utils/catalogMatch';
import { catalogSetKey, ownedCountBySet } from '../utils/catalogOwnership';

// Kartenkatalog: alle deutschen Sets, nach Serie (Ära) gruppiert, neueste zuerst.
// Daten: TCGdex (offene API), siehe services/tcgdex.ts.
const LANG_ADJECTIVE = { de: 'deutsche', en: 'englische', ja: 'japanische' } as const;

const CardCatalog: React.FC = () => {
  const [series, setSeries] = useState<SerieDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [onlyStarted, setOnlyStarted] = useState(false);
  const owned = useCatalogOwned();
  const items = useItemsData();
  const ownedCounts = useMemo(() => ownedCountBySet(owned, items), [owned, items]);
  const categories = useCategoriesData();
  const { catalogLanguage: lang, linkCategories } = useCatalogSettings();
  const ownedIn = (setId: string) => ownedCounts[catalogSetKey(setId, lang)] ?? 0;
  // Offen sind nur Einträge aus Kategorien mit Karten (ohne Sealed, Zubehör …).
  const unlinkedCount = useMemo(() => {
    const scope = linkCategoryIds(categories, linkCategories);
    return items.filter((i) => !i.catalog && scope.has(i.categoryId)).length;
  }, [items, categories, linkCategories]);

  useEffect(() => {
    let alive = true;
    setError(null);
    setSeries(null);
    fetchCatalog(lang)
      .then((data) => alive && setSeries(data))
      .catch(() => alive && setError('Der Katalog konnte nicht geladen werden. Bist du online?'));
    return () => {
      alive = false;
    };
  }, [reloadKey, lang]);

  const filtered = useMemo(() => {
    if (!series) return [];
    const q = normalizeSearch(query);
    if (!q && !onlyStarted) return series;
    return series
      .map((s) => ({
        ...s,
        sets: s.sets.filter(
          (set) =>
            (!onlyStarted || ownedIn(set.id) > 0) &&
            (!q ||
              normalizeSearch(set.name).includes(q) ||
              normalizeSearch(set.originalName ?? '').includes(q) ||
              normalizeSearch(set.id).includes(q))
        ),
      }))
      .filter((s) => s.sets.length > 0);
    // ownedIn hängt nur an ownedCounts und lang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, query, onlyStarted, ownedCounts, lang]);

  const totals = useMemo(() => {
    const sets = series?.flatMap((s) => s.sets) ?? [];
    return { sets: sets.length, cards: sets.reduce((n, s) => n + (s.cardCount?.total ?? 0), 0) };
  }, [series]);

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Kartenkatalog</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {series
                ? `${totals.sets} ${LANG_ADJECTIVE[lang]} Sets · ${totals.cards.toLocaleString('de-DE')} Karten · Preise von Cardmarket`
                : 'Sets mit Cardmarket-Preisen'}
            </p>
            {unlinkedCount > 0 && (
              <Link
                to="/katalog/verknuepfen"
                className="mt-2 inline-block text-sm text-pokemon-blue dark:text-blue-300 hover:underline"
              >
                Sammlung mit dem Katalog verknüpfen ({unlinkedCount} Einträge offen)
              </Link>
            )}
          </div>
          <div className="inline-flex rounded-md shadow-sm sm:ml-auto" role="group" aria-label="Katalogsprache">
            {CATALOG_LANGUAGES.map((l, i) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={lang === l.id}
                onClick={() => updateCatalogSettings({ catalogLanguage: l.id })}
                className={`px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 ${i > 0 ? '-ml-px' : 'rounded-l-md'} ${
                  i === CATALOG_LANGUAGES.length - 1 ? 'rounded-r-md' : ''
                } ${
                  lang === l.id
                    ? 'bg-pokemon-blue text-white border-pokemon-blue z-10'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={onlyStarted}
              onChange={(e) => setOnlyStarted(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-pokemon-blue focus:ring-pokemon-blue"
            />
            Nur begonnene Sets
          </label>
          <div className="relative sm:w-72">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Set suchen…"
              aria-label="Set suchen"
              className={`${inputClass} pl-10`}
            />
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-lg bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-4">
            <span>{error}</span>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className={primaryButtonSmallClass}
            >
              Erneut versuchen
            </button>
          </div>
        )}

        {!series && !error && (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4" aria-busy="true">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-28 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
            ))}
          </div>
        )}

        {series && filtered.length === 0 && (
          <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
            {onlyStarted && !query ? 'Du hast noch in keinem Set Karten markiert.' : 'Kein Set gefunden.'}
          </p>
        )}

        {filtered.map((serie) => (
          <section key={serie.id} className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {serie.name}
              {serie.releaseDate && (
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                  ab {serie.releaseDate.slice(0, 4)}
                </span>
              )}
            </h2>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {serie.sets.map((set) => (
                <Link
                  key={set.id}
                  to={lang === 'de' ? `/katalog/${encodeURIComponent(set.id)}` : `/katalog/${lang}/${encodeURIComponent(set.id)}`}
                  className="group flex flex-col items-center justify-between rounded-lg bg-white dark:bg-gray-800 shadow p-3 hover:ring-2 hover:ring-pokemon-blue transition"
                >
                  <div className="h-14 w-full flex items-center justify-center">
                    <FallbackImage
                      sources={setLogoSources(set, serie.id, lang)}
                      alt=""
                      loading="lazy"
                      className="max-h-14 max-w-full object-contain"
                      fallback={
                        // Ohne Logo (vor allem japanische Sets) steht das Set-Kürzel in der Kachel.
                        <span className="font-mono text-lg font-semibold tracking-wide text-gray-400 dark:text-gray-500">
                          {set.id.toUpperCase()}
                        </span>
                      }
                    />
                  </div>
                  <div className="mt-2 text-center">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{set.name}</div>
                    {set.originalName && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1" lang="ja">
                        {set.originalName}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {lang === 'ja' && <span className="font-mono">{set.id} · </span>}
                      {ownedIn(set.id) > 0
                        ? `${ownedIn(set.id)} von ${set.cardCount?.total ?? '?'} Karten`
                        : `${set.cardCount?.total ?? '?'} Karten`}
                    </div>
                  </div>
                  {ownedIn(set.id) > 0 && (
                    <div className="mt-2 h-1 w-full rounded bg-gray-200 dark:bg-gray-700 overflow-hidden" aria-hidden="true">
                      <div
                        className="h-full bg-green-500"
                        style={{
                          width: `${Math.min(100, (ownedIn(set.id) / (set.cardCount?.total || ownedIn(set.id))) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))}

        <p className="mt-10 text-xs text-gray-400 dark:text-gray-500">
          Kartendaten und Bilder: TCGdex (tcgdex.dev). Preise: Cardmarket-Trend, sprachübergreifend, nur zur Orientierung.
        </p>
      </div>
    </div>
  );
};

export default CardCatalog;
