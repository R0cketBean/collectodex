import React, { useEffect, useState } from 'react';
import { CheckBadgeIcon, CheckIcon, PlusIcon } from '@heroicons/react/24/outline';
import FallbackImage from '../catalog/FallbackImage';
import { catalogCardImageSources, fetchCard, formatEur, mapLimit, summarizePricing, type PriceSummary } from '../../services/tcgdex';
import type { CatalogLang } from '../../types/models';
import type { RankedCandidate } from '../../utils/cardScan';

// Trefferliste des Kartenscanners (#169): ein sicherer Treffer groß und mit
// Cardmarket-Preisen, weitere Kandidaten kleiner darunter. Ein Klick öffnet
// die Karte im Scanner selbst, damit man direkt weiterscannen kann.

const MATCH_LABEL: Record<RankedCandidate['matches'][number], string> = {
  code: 'Set-Code',
  number: 'Nummer',
  total: 'Set-Größe',
  name: 'Name',
};

// Preise nur für die ersten Treffer laden – jede Karte ist eine Abfrage.
const PRICED = 6;

interface ScanResultsProps {
  results: RankedCandidate[];
  confident: boolean;
  lang: CatalogLang;
  reverse: boolean;
  onOpen: (candidate: RankedCandidate) => void;
  /** Stapel-Modus (#171): Treffer in den Stapel legen. */
  onAddToStack?: (candidate: RankedCandidate) => void;
  /** Ob die Karte (in der gewählten Fassung) schon im Stapel liegt. */
  inStack?: (candidate: RankedCandidate) => boolean;
}

const priceOf = (price: PriceSummary | undefined, reverse: boolean) =>
  price ? (reverse && price.reverseTrend !== null ? price.reverseTrend : price.trend) : undefined;

const ScanResults: React.FC<ScanResultsProps> = ({ results, confident, lang, reverse, onOpen, onAddToStack, inStack }) => {
  const [prices, setPrices] = useState<Record<string, PriceSummary | null>>({});

  useEffect(() => {
    const controller = new AbortController();
    setPrices({});
    void mapLimit(results.slice(0, PRICED), 3, async (c) => {
      const detail = await fetchCard(c.cardId, controller.signal, lang).catch(() => null);
      if (!controller.signal.aborted) {
        setPrices((prev) => ({ ...prev, [c.cardId]: detail ? summarizePricing(detail) : null }));
      }
    });
    return () => controller.abort();
  }, [results, lang]);

  // Liegt neben der Kartenschaltfläche (Schaltflächen dürfen nicht verschachtelt sein).
  const stackButton = (c: RankedCandidate, position = 'bottom-2 right-2') => {
    if (!onAddToStack) return null;
    const added = inStack?.(c) ?? false;
    return (
      <button
        type="button"
        onClick={() => onAddToStack(c)}
        title={added ? 'Liegt schon im Stapel – noch eine hinzufügen' : 'In den Stapel legen'}
        className={`absolute ${position} inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
          added
            ? 'bg-green-600 text-white hover:bg-green-700'
            : 'bg-pokemon-blue text-white hover:bg-blue-700'
        }`}
      >
        {added ? <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />}
        {added ? 'Im Stapel' : 'Zum Stapel'}
      </button>
    );
  };

  const [best, ...rest] = confident ? results : [];
  const others = confident ? rest : results;

  const image = (c: RankedCandidate) => (
    <FallbackImage
      sources={catalogCardImageSources(lang, c, c.setId, 'low')}
      alt={c.name}
      loading="lazy"
      showLanguageBadge={lang === 'de'}
      className="h-full w-full object-contain"
    />
  );
  const number = (c: RankedCandidate) => `${c.localId}${c.official && /^\d+$/.test(c.localId) ? `/${c.official}` : ''}`;
  const chips = (c: RankedCandidate) => (
    <div className="mt-1 flex flex-wrap gap-1">
      {c.matches.map((m) => (
        <span
          key={m}
          className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300"
        >
          {MATCH_LABEL[m]}
        </span>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {best && (
        <div className="relative">
        <button
          type="button"
          onClick={() => onOpen(best)}
          className="flex w-full gap-4 rounded-lg border border-green-400 bg-green-50 p-3 text-left transition-colors hover:bg-green-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-pokemon-blue dark:border-green-700 dark:bg-green-900/20 dark:hover:bg-green-900/30"
        >
          <div className="relative aspect-[5/7] w-28 flex-shrink-0 overflow-hidden rounded bg-gray-100 dark:bg-gray-900 sm:w-36">
            {image(best)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-300">
              <CheckBadgeIcon className="h-4 w-4" aria-hidden="true" /> Sicherer Treffer
            </div>
            <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{best.name}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              {best.setName} · <span className="tabular-nums">{number(best)}</span>
            </div>
            {chips(best)}
            <PriceBlock price={prices[best.cardId]} loaded={best.cardId in prices} reverse={reverse} />
            <div className="mt-2 text-xs text-pokemon-blue dark:text-blue-300">Details und „In Sammlung übernehmen“ →</div>
          </div>
        </button>
        {stackButton(best, 'top-2 right-2')}
        </div>
      )}

      {others.length > 0 && (
        <div>
          {best && (
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Weitere Treffer
            </h3>
          )}
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {others.map((c) => {
              const value = priceOf(prices[c.cardId] ?? undefined, reverse);
              return (
                <li key={c.cardId} className="relative">
                  <button
                    type="button"
                    onClick={() => onOpen(c)}
                    className="flex w-full gap-3 rounded-lg border border-gray-200 bg-white p-2 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pokemon-blue dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/60"
                  >
                    <div className="relative aspect-[5/7] w-20 flex-shrink-0 overflow-hidden rounded bg-gray-100 dark:bg-gray-900">
                      {image(c)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{c.name}</div>
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400">{c.setName}</div>
                      <div className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{number(c)}</div>
                      {value !== undefined && (
                        <div className="mt-0.5 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                          {formatEur(value)}
                        </div>
                      )}
                      {chips(c)}
                      {onAddToStack && <div className="h-6" aria-hidden="true" />}
                    </div>
                  </button>
                  {stackButton(c)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

const PriceBlock: React.FC<{ price: PriceSummary | null | undefined; loaded: boolean; reverse: boolean }> = ({
  price,
  loaded,
  reverse,
}) => {
  if (!loaded) return <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Preis wird geladen …</p>;
  if (!price || (price.trend === null && price.low === null)) {
    return <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Kein Cardmarket-Preis bekannt.</p>;
  }
  const showReverse = reverse && price.reverseTrend !== null;
  return (
    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
      <div>
        <dt className="text-xs text-gray-500 dark:text-gray-400">{showReverse ? 'Trend Reverse Holo' : 'Trend'}</dt>
        <dd className="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
          {formatEur(showReverse ? price.reverseTrend : price.trend)}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-gray-500 dark:text-gray-400">ab</dt>
        <dd className="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
          {formatEur(showReverse ? price.reverseLow : price.low)}
        </dd>
      </div>
      {reverse && price.reverseTrend === null && (
        <div className="self-end text-xs text-gray-500 dark:text-gray-400">Keine Reverse-Holo-Fassung bekannt</div>
      )}
      <div className="w-full text-xs text-gray-400 dark:text-gray-500">Cardmarket, über alle Sprachen und Zustände</div>
    </dl>
  );
};

export default ScanResults;
