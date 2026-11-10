import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import FallbackImage from '../components/catalog/FallbackImage';
import { fetchCatalog, normalizeSearch, setLogoSources, type SerieDetail } from '../services/tcgdex';

// Kartenkatalog: alle deutschen Sets, nach Serie (Ära) gruppiert, neueste zuerst.
// Daten: TCGdex (offene API), siehe services/tcgdex.ts.
const CardCatalog: React.FC = () => {
  const [series, setSeries] = useState<SerieDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    fetchCatalog()
      .then((data) => alive && setSeries(data))
      .catch(() => alive && setError('Der Katalog konnte nicht geladen werden. Bist du online?'));
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const filtered = useMemo(() => {
    if (!series) return [];
    const q = normalizeSearch(query);
    if (!q) return series;
    return series
      .map((s) => ({
        ...s,
        sets: s.sets.filter(
          (set) => normalizeSearch(set.name).includes(q) || normalizeSearch(set.id).includes(q)
        ),
      }))
      .filter((s) => s.sets.length > 0);
  }, [series, query]);

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
                ? `${totals.sets} deutsche Sets · ${totals.cards.toLocaleString('de-DE')} Karten · Preise von Cardmarket`
                : 'Deutsche Sets mit Cardmarket-Preisen'}
            </p>
          </div>
          <div className="relative sm:w-72">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Set suchen…"
              aria-label="Set suchen"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-10 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-pokemon-blue"
            />
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-lg bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-4">
            <span>{error}</span>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="rounded-md bg-pokemon-blue px-3 py-1.5 text-white text-sm hover:opacity-90"
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
          <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">Kein Set gefunden.</p>
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
                  to={`/katalog/${encodeURIComponent(set.id)}`}
                  className="group flex flex-col items-center justify-between rounded-lg bg-white dark:bg-gray-800 shadow p-3 hover:ring-2 hover:ring-pokemon-blue transition"
                >
                  <div className="h-14 w-full flex items-center justify-center">
                    <FallbackImage
                      sources={setLogoSources(set, serie.id)}
                      alt=""
                      loading="lazy"
                      className="max-h-14 max-w-full object-contain"
                    />
                  </div>
                  <div className="mt-2 text-center">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{set.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{set.cardCount?.total ?? '?'} Karten</div>
                  </div>
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
