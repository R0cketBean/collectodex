import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeftIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import FallbackImage from '../components/catalog/FallbackImage';
import {
  cardImageSources,
  cardmarketSearchUrl,
  fetchEnglishCardImages,
  fetchSet,
  formatEur,
  loadSetCards,
  normalizeSearch,
  sumSetValue,
  setLogoSources,
  summarizePricing,
  type CardBrief,
  type CardDetail,
  type SetDetail,
} from '../services/tcgdex';

type SortKey = 'number' | 'price-desc' | 'price-asc' | 'name';

const openExternal = (url: string) => {
  if (window.electronAPI?.openExternalURL) {
    void window.electronAPI.openExternalURL(url);
  } else {
    window.open(url, '_blank', 'noopener');
  }
};

// Kartennummern wie "001", "TG05", "SV049" natürlich sortieren.
const compareLocalId = (a: string, b: string) =>
  a.localeCompare(b, 'de', { numeric: true, sensitivity: 'base' });

// Der Schlüssel sorgt dafür, dass Suche, Sortierung und Detailansicht beim
// Wechsel auf ein anderes Set zurückgesetzt werden.
const CardCatalogSetRoute: React.FC = () => {
  const { setId = '' } = useParams();
  return <CardCatalogSet key={setId} setId={setId} />;
};

const CardCatalogSet: React.FC<{ setId: string }> = ({ setId }) => {
  const [set, setSet] = useState<SetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, CardDetail>>({});
  // Englische Bilder nach Kartennummer, als Ersatz für fehlende deutsche.
  const [englishImages, setEnglishImages] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('number');
  const [selected, setSelected] = useState<CardBrief | null>(null);

  // Set laden, danach die Kartendetails (Preise) nach und nach.
  useEffect(() => {
    const controller = new AbortController();
    setSet(null);
    setDetails({});
    setEnglishImages({});
    setError(null);
    void fetchEnglishCardImages(setId).then(
      (images) => !controller.signal.aborted && setEnglishImages(images)
    );
    fetchSet(setId)
      .then((data) => {
        if (controller.signal.aborted) return;
        setSet(data);
        void loadSetCards(
          data.cards,
          (card) => setDetails((prev) => ({ ...prev, [card.id]: card })),
          controller.signal
        );
      })
      .catch(() => !controller.signal.aborted && setError('Das Set konnte nicht geladen werden.'));
    return () => controller.abort();
  }, [setId]);

  // Esc schließt die Detailansicht.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const loadedCount = Object.keys(details).length;
  const cardTotal = set?.cards.length ?? 0;
  const setValue = useMemo(() => sumSetValue(Object.values(details)), [details]);

  const visibleCards = useMemo(() => {
    if (!set) return [];
    const q = normalizeSearch(query);
    const list = q
      ? set.cards.filter(
          (c) =>
            normalizeSearch(c.name).includes(q) ||
            normalizeSearch(c.localId).includes(q) ||
            normalizeSearch(details[c.id]?.rarity ?? '').includes(q)
        )
      : [...set.cards];
    const price = (c: CardBrief) => summarizePricing(details[c.id] ?? {}).trend;
    list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'de');
      if (sort === 'price-desc' || sort === 'price-asc') {
        const pa = price(a);
        const pb = price(b);
        // Karten ohne (noch geladenen) Preis ans Ende.
        if (pa === null && pb === null) return compareLocalId(a.localId, b.localId);
        if (pa === null) return 1;
        if (pb === null) return -1;
        return sort === 'price-desc' ? pb - pa : pa - pb;
      }
      return compareLocalId(a.localId, b.localId);
    });
    return list;
  }, [set, details, query, sort]);

  if (error) {
    return (
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <BackLink />
        <p className="mt-6 rounded-lg bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }

  const selectedDetail = selected ? details[selected.id] : undefined;

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <BackLink />

        {/* Kopf mit Setwert */}
        <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 flex flex-col md:flex-row md:items-center gap-4">
          {set && (
            <FallbackImage
              sources={setLogoSources(set, set.serie?.id)}
              alt=""
              className="h-16 max-w-[12rem] object-contain"
            />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 break-words">
              {set?.name ?? 'Set wird geladen…'}
            </h1>
            {set && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {set.serie?.name}
                {set.releaseDate && ` · erschienen ${new Date(set.releaseDate).toLocaleDateString('de-DE')}`}
                {` · ${set.cardCount.total} Karten`}
                {set.cardCount.total !== set.cardCount.official && ` (${set.cardCount.official} offiziell)`}
              </p>
            )}
          </div>
          <div className="md:text-right">
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Setwert (Trend)</div>
            <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
              {formatEur(setValue.total)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {loadedCount < cardTotal
                ? `Preise werden geladen: ${loadedCount} von ${cardTotal}`
                : `Summe aus ${setValue.priced} von ${cardTotal} Karten mit Preis`}
            </div>
          </div>
        </div>

        {cardTotal > 0 && loadedCount < cardTotal && (
          <div className="mt-2 h-1 w-full rounded bg-gray-200 dark:bg-gray-700 overflow-hidden" aria-hidden="true">
            <div
              className="h-full bg-pokemon-blue transition-all"
              style={{ width: `${Math.round((loadedCount / cardTotal) * 100)}%` }}
            />
          </div>
        )}

        {/* Suche & Sortierung */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, Nummer oder Seltenheit…"
              aria-label="Karte suchen"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-10 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-pokemon-blue"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sortierung"
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="number">Nach Nummer</option>
            <option value="price-desc">Teuerste zuerst</option>
            <option value="price-asc">Günstigste zuerst</option>
            <option value="name">Nach Name</option>
          </select>
        </div>

        {/* Kartenraster */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {!set &&
            Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[5/7] rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
            ))}
          {visibleCards.map((card) => {
            const detail = details[card.id];
            const price = detail ? summarizePricing(detail) : null;
            return (
              <button
                key={card.id}
                onClick={() => setSelected(card)}
                className="text-left rounded-lg bg-white dark:bg-gray-800 shadow overflow-hidden hover:ring-2 hover:ring-pokemon-blue transition focus:outline-none focus:ring-2 focus:ring-pokemon-blue"
              >
                <div className="relative aspect-[5/7] bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                  <FallbackImage
                    sources={cardImageSources(card.image, englishImages[card.localId])}
                    alt={card.name}
                    loading="lazy"
                    showLanguageBadge
                    className="h-full w-full object-contain"
                    fallback={<span className="text-xs text-gray-400 p-2 text-center">Kein Bild</span>}
                  />
                </div>
                <div className="p-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                    {card.localId}
                    {set && /^\d+$/.test(card.localId) && `/${String(set.cardCount.official).padStart(card.localId.length, '0')}`}
                  </div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{card.name}</div>
                  <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                      {detail ? formatEur(price?.trend) : <span className="inline-block h-4 w-12 rounded bg-gray-200 dark:bg-gray-700 animate-pulse align-middle" />}
                    </span>
                    {price?.reverseTrend !== null && price?.reverseTrend !== undefined && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums" title="Reverse Holo">
                        RH {formatEur(price.reverseTrend)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {set && visibleCards.length === 0 && (
          <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">Keine Karte gefunden.</p>
        )}
      </div>

      {selected && (
        <CardModal
          card={selected}
          detail={selectedDetail}
          englishImage={englishImages[selected.localId]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};

const BackLink: React.FC = () => (
  <Link
    to="/katalog"
    className="inline-flex items-center text-sm text-pokemon-blue dark:text-blue-300 hover:underline"
  >
    <ArrowLeftIcon className="h-4 w-4 mr-1" /> Alle Sets
  </Link>
);

const PriceRow: React.FC<{ label: string; value: number | null }> = ({ label, value }) => (
  <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
    <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
    <dd className="font-medium text-gray-900 dark:text-gray-100 tabular-nums">{formatEur(value)}</dd>
  </div>
);

const CardModal: React.FC<{
  card: CardBrief;
  detail?: CardDetail;
  englishImage?: string;
  onClose: () => void;
}> = ({ card, detail, englishImage, onClose }) => {
  const price = detail ? summarizePricing(detail) : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={card.name}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-full overflow-y-auto rounded-lg bg-white dark:bg-gray-800 shadow-xl">
        <button
          onClick={onClose}
          aria-label="Schließen"
          className="absolute top-3 right-3 rounded-full p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
        <div className="flex flex-col md:flex-row gap-6 p-6">
          <div className="relative md:w-1/2 flex-shrink-0">
            <FallbackImage
              sources={cardImageSources(card.image, englishImage, 'high')}
              alt={card.name}
              showLanguageBadge
              className="w-full rounded-lg shadow"
              fallback={
                <div className="aspect-[5/7] rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center text-sm text-gray-400">
                  Kein Bild
                </div>
              }
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 pr-8">{card.name}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {detail?.set.name} · Nr. {card.localId}
              {detail?.rarity && ` · ${detail.rarity}`}
            </p>
            {detail?.types && detail.types.length > 0 && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Typ: {detail.types.join(', ')}</p>
            )}
            {detail?.illustrator && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Illustration: {detail.illustrator}</p>
            )}

            <h3 className="mt-6 text-sm font-semibold text-gray-900 dark:text-gray-100">Cardmarket-Preise</h3>
            {!detail ? (
              <p className="mt-2 text-sm text-gray-500">Preise werden geladen…</p>
            ) : price && price.trend === null && price.low === null ? (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Für diese Karte gibt es keinen Preis.</p>
            ) : (
              <dl className="mt-2 text-sm">
                <PriceRow label="Trend" value={price?.trend ?? null} />
                <PriceRow label="Ab (günstigstes Angebot)" value={price?.low ?? null} />
                <PriceRow label="Ø 30 Tage" value={price?.avg30 ?? null} />
                {price?.reverseTrend !== null && <PriceRow label="Reverse Holo – Trend" value={price?.reverseTrend ?? null} />}
                {price?.reverseLow !== null && <PriceRow label="Reverse Holo – ab" value={price?.reverseLow ?? null} />}
              </dl>
            )}
            {price?.updated && (
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                Stand {new Date(price.updated).toLocaleDateString('de-DE')} · Preise über alle Sprachen und Zustände
              </p>
            )}

            <button
              onClick={() => openExternal(cardmarketSearchUrl(card.name))}
              className="mt-6 inline-flex items-center rounded-md bg-pokemon-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Auf Cardmarket suchen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardCatalogSetRoute;
