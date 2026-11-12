import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, CheckIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useCategoriesData, useCollectionActions, useItemsData } from '../context/CollectionContext';
import { toggleCatalogOwned, useCatalogOwned } from '../hooks/useCatalogOwned';
import type { CatalogLang, CatalogVariant, Category, CollectionItem } from '../types/models';
import { buildCatalogItem } from '../utils/catalogItem';
import { useCatalogSettings } from '../hooks/useCatalogSettings';
import { buildCardmarketFilter, pickCatalogPrice } from '../utils/catalogSettings';
import {
  cardOwnership,
  catalogSetKey,
  linkedItemsByCard,
  summarizeSetOwnership,
  type CardOwnership,
} from '../utils/catalogOwnership';
import FallbackImage from '../components/catalog/FallbackImage';
import {
  catalogCardImageSources,
  isCatalogLang,
  cardmarketProductUrl,
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
import { firstLoadableImage } from '../utils/imageProbe';
import { inputClass, selectClass } from '../utils/formStyles';

type SortKey = 'number' | 'price-desc' | 'price-asc' | 'name';
type OwnedFilter = 'all' | 'owned' | 'missing';

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
  const { setId = '', lang: langParam } = useParams();
  const lang: CatalogLang = isCatalogLang(langParam) ? langParam : 'de';
  return <CardCatalogSet key={`${lang}:${setId}`} setId={setId} lang={lang} />;
};

const CardCatalogSet: React.FC<{ setId: string; lang: CatalogLang }> = ({ setId, lang }) => {
  // Besitz wird je Sprache geführt: deutsche und englische Sets teilen ihre Kennungen.
  const setKey = catalogSetKey(setId, lang);
  const [set, setSet] = useState<SetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, CardDetail>>({});
  // Englische Bilder nach Kartennummer, als Ersatz für fehlende deutsche.
  const [englishImages, setEnglishImages] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('number');
  const [selected, setSelected] = useState<CardBrief | null>(null);
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>('all');

  const navigate = useNavigate();
  const items = useItemsData();
  const categories = useCategoriesData();
  const { addItem, calculateItemValue, deleteItem, setItemCatalogRefs } = useCollectionActions();
  const checked = useCatalogOwned()[setKey];
  const settings = useCatalogSettings();
  const linked = useMemo(() => linkedItemsByCard(items, setId, lang), [items, setId, lang]);
  const ownershipOf = (cardId: string) => cardOwnership(checked?.[cardId], linked[cardId]);

  // Set laden, danach die Kartendetails (Preise) nach und nach.
  useEffect(() => {
    const controller = new AbortController();
    setSet(null);
    setDetails({});
    setEnglishImages({});
    setError(null);
    // Englische Ersatzbilder braucht nur der deutsche Katalog.
    void (lang === 'de' ? fetchEnglishCardImages(setId) : Promise.resolve({})).then(
      (images) => !controller.signal.aborted && setEnglishImages(images)
    );
    fetchSet(setId, lang)
      .then((data) => {
        if (controller.signal.aborted) return;
        setSet(data);
        void loadSetCards(
          data.cards,
          (card) => setDetails((prev) => ({ ...prev, [card.id]: card })),
          controller.signal,
          lang
        );
      })
      .catch(() => !controller.signal.aborted && setError('Das Set konnte nicht geladen werden.'));
    return () => controller.abort();
  }, [setId, lang]);

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

  // Bestand: Haken und verknüpfte Einträge, Wert daraus errechnet.
  const ownership = useMemo(
    () =>
      summarizeSetOwnership(
        (set?.cards ?? []).map((c) => {
          const detail = details[c.id];
          if (!detail) return { id: c.id };
          const p = summarizePricing(detail);
          return {
            id: c.id,
            // Japanische Sets haben keine Reverse-Holo-Fassungen; TCGdex kennzeichnet sie dort trotzdem.
            price: {
              trend: p.trend,
              reverseTrend: p.reverseTrend,
              hasReverse: lang !== 'ja' && Boolean(detail.variants?.reverse),
            },
          };
        }),
        checked,
        linked,
        (item) => {
          const total = calculateItemValue(item).totalValue;
          return typeof total === 'number' && Number.isFinite(total) ? total : 0;
        }
      ),
    // calculateItemValue ist referenz-stabil (Actions-Context).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, details, checked, linked, lang]
  );

  const visibleCards = useMemo(() => {
    if (!set) return [];
    const q = normalizeSearch(query);
    const list = set.cards.filter((c) => {
      if (ownedFilter !== 'all') {
        const has = cardOwnership(checked?.[c.id], linked[c.id]).variants.length > 0;
        if (has !== (ownedFilter === 'owned')) return false;
      }
      return (
        !q ||
        normalizeSearch(c.name).includes(q) ||
        normalizeSearch(c.localId).includes(q) ||
        normalizeSearch(details[c.id]?.rarity ?? '').includes(q)
      );
    });
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
  }, [set, details, query, sort, ownedFilter, checked, linked]);

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
              sources={setLogoSources(set, set.serie?.id, lang)}
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
                {set.originalName && <span lang="ja">{set.originalName} · </span>}
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

        {/* Eigener Bestand in diesem Set */}
        {set && (
          <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Dein Bestand
                {ownership.complete && (
                  <span className="ml-2 rounded-full bg-green-100 dark:bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">
                    Master Set vollständig
                  </span>
                )}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 tabular-nums">
                {ownership.ownedCards} von {ownership.total} Karten
                {ownership.reverseTotal > 0 && ` · Reverse Holo ${ownership.reverseOwned} von ${ownership.reverseTotal}`}
              </p>
            </div>
            <div
              className="mt-2 h-2 w-full rounded bg-gray-200 dark:bg-gray-700 overflow-hidden"
              role="progressbar"
              aria-label="Fortschritt im Set"
              aria-valuemin={0}
              aria-valuemax={ownership.total}
              aria-valuenow={ownership.ownedCards}
            >
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${ownership.total ? (ownership.ownedCards / ownership.total) * 100 : 0}%` }}
              />
            </div>
            {ownership.ownedCards > 0 && (
              <dl className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Wert deiner Karten</dt>
                  <dd className="text-lg font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                    {formatEur(ownership.entryValue + ownership.catalogValue)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">davon Sammlungseinträge</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                    {formatEur(ownership.entryValue)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">davon Katalogwert (nur abgehakt)</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                    {formatEur(ownership.catalogValue)}
                  </dd>
                </div>
              </dl>
            )}
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              {ownership.ownedCards === 0
                ? 'Hake Karten ab, die du besitzt, oder übernimm sie als Eintrag in deine Sammlung.'
                : 'Der Katalogwert nutzt den Cardmarket-Trend und zählt nicht zum Sammlungswert.'}
              {ownership.unpriced > 0 && ` ${ownership.unpriced} abgehakte Karten haben keinen Katalogpreis.`}
            </p>
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
              className={`${inputClass} pl-10`}
            />
          </div>
          <select
            value={ownedFilter}
            onChange={(e) => setOwnedFilter(e.target.value as OwnedFilter)}
            aria-label="Bestand filtern"
            className={`${selectClass} sm:w-auto`}
          >
            <option value="all">Alle Karten</option>
            <option value="owned">Vorhanden</option>
            <option value="missing">Fehlt mir</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sortierung"
            className={`${selectClass} sm:w-auto`}
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
            const own = ownershipOf(card.id);
            const has = own.variants.length > 0;
            const viaEntry = own.entryVariants.length > 0;
            return (
              <div
                key={card.id}
                className={`relative rounded-lg bg-white dark:bg-gray-800 shadow overflow-hidden transition hover:ring-2 hover:ring-pokemon-blue ${
                  has ? 'ring-2 ring-green-500' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleCatalogOwned(setKey, card.id, 'normal')}
                  disabled={own.entryVariants.includes('normal')}
                  aria-pressed={has}
                  aria-label={has ? `${card.name}: vorhanden` : `${card.name} als vorhanden markieren`}
                  title={
                    viaEntry
                      ? 'In deiner Sammlung eingetragen'
                      : has
                        ? 'Vorhanden – Klick entfernt die Markierung'
                        : 'Als vorhanden markieren'
                  }
                  className={`absolute top-1 left-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 shadow focus:outline-none focus:ring-2 focus:ring-pokemon-blue ${
                    has
                      ? 'border-green-500 bg-green-500 text-white'
                      : 'border-white/80 bg-black/40 text-transparent hover:text-white'
                  } ${viaEntry ? 'cursor-default' : ''}`}
                >
                  <CheckIcon className="h-4 w-4" strokeWidth={3} />
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(card)}
                  className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-pokemon-blue"
                >
                <div className="relative aspect-[5/7] bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                  <FallbackImage
                    sources={catalogCardImageSources(lang, card, setId, 'low', englishImages[card.localId])}
                    alt={card.name}
                    loading="lazy"
                    showLanguageBadge={lang === 'de'}
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
                    {lang !== 'ja' && price?.reverseTrend !== null && price?.reverseTrend !== undefined && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums" title="Reverse Holo">
                        RH {formatEur(price.reverseTrend)}
                      </span>
                    )}
                  </div>
                </div>
                </button>
              </div>
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
          setId={setId}
          setName={set?.name}
          lang={lang}
          ownership={ownershipOf(selected.id)}
          categories={categories}
          onToggle={(variant) => toggleCatalogOwned(setKey, selected.id, variant)}
          onAdd={async (category, variant) => {
            if (!set) return;
            const price = selectedDetail ? summarizePricing(selectedDetail) : null;
            // Nur ein Bild übernehmen, das sich wirklich laden lässt.
            const image = await firstLoadableImage(
              catalogCardImageSources(lang, selected, setId, 'high', englishImages[selected.localId])
            );
            const draft = buildCatalogItem(category, {
              cardId: selected.id,
              setId,
              lang,
              setName: set.name,
              name: selected.name,
              localId: selected.localId,
              variant,
              price: pickCatalogPrice(price, settings.priceBasis, variant),
              imageUrl: image,
              productUrl: cardmarketProductUrl(price?.idProduct, selected.name, buildCardmarketFilter(settings, lang)),
            });
            const id = addItem(category.id, draft.values, {
              links: draft.links,
              images: draft.images,
              catalog: draft.catalog,
            });
            navigate(`/category/${category.id}?highlight=${id}`);
          }}
          onUnlink={(itemId) => setItemCatalogRefs({ [itemId]: null })}
          onDelete={(item) => {
            const name = String(item.values?.name ?? 'Ohne Namen');
            if (window.confirm(`Eintrag „${name}“ aus deiner Sammlung löschen? Das lässt sich nicht rückgängig machen.`)) {
              deleteItem(item.id);
            }
          }}
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
  setId: string;
  /** Anzeigename des Sets (bei japanischen Sets der englische). */
  setName?: string;
  lang: CatalogLang;
  ownership: CardOwnership;
  categories: Category[];
  onToggle: (variant: CatalogVariant) => void;
  onAdd: (category: Category, variant: CatalogVariant) => void | Promise<void>;
  onUnlink: (itemId: string) => void;
  onDelete: (item: CollectionItem) => void;
  onClose: () => void;
}> = ({ card, detail, englishImage, setId, setName, lang, ownership, categories, onToggle, onAdd, onUnlink, onDelete, onClose }) => {
  const price = detail ? summarizePricing(detail) : null;
  const hasReverse = lang !== 'ja' && Boolean(detail?.variants?.reverse);
  // Nur Kategorien mit Attributen taugen als Ziel (unvollständig angelegte fallen raus).
  const targets = categories.filter((c) => Array.isArray(c.attributes) && c.attributes.length > 0);
  const [targetId, setTargetId] = useState(
    () => (targets.find((c) => c.id === 'singles') ?? targets[0])?.id ?? ''
  );
  const [addVariant, setAddVariant] = useState<CatalogVariant>('normal');
  const target = targets.find((c) => c.id === targetId);
  const variantLabel = (v: CatalogVariant) => (v === 'reverse' ? 'Reverse Holo' : hasReverse ? 'Normal' : 'Vorhanden');
  const categoryName = (item: CollectionItem) =>
    categories.find((c) => c.id === item.categoryId)?.name ?? 'Sammlung';
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
              sources={catalogCardImageSources(lang, card, setId, 'high', englishImage)}
              alt={card.name}
              showLanguageBadge={lang === 'de'}
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
              {setName ?? detail?.set.name} · Nr. {card.localId}
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
              className="mt-4 text-sm text-pokemon-blue dark:text-blue-300 hover:underline"
            >
              Auf Cardmarket suchen
            </button>

            <h3 className="mt-6 text-sm font-semibold text-gray-900 dark:text-gray-100">Dein Bestand</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['normal', ...(hasReverse ? ['reverse'] : [])] as CatalogVariant[]).map((variant) => {
                const has = ownership.variants.includes(variant);
                const viaEntry = ownership.entryVariants.includes(variant);
                return (
                  <button
                    key={variant}
                    type="button"
                    onClick={() => onToggle(variant)}
                    disabled={viaEntry}
                    aria-pressed={has}
                    title={viaEntry ? 'Durch einen Sammlungseintrag vorhanden' : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                      has
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-green-500'
                    } ${viaEntry ? 'cursor-default' : ''}`}
                  >
                    <CheckIcon className={`h-4 w-4 ${has ? '' : 'opacity-30'}`} strokeWidth={3} />
                    {variantLabel(variant)}
                  </button>
                );
              })}
            </div>

            {ownership.items.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {ownership.items.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Link
                      to={`/category/${item.categoryId}?highlight=${item.id}`}
                      className="text-pokemon-blue dark:text-blue-300 hover:underline"
                    >
                      Eintrag in „{categoryName(item)}“ öffnen
                    </Link>
                    <button
                      type="button"
                      onClick={() => onUnlink(item.id)}
                      title="Der Eintrag bleibt in deiner Sammlung, zählt hier aber nicht mehr als vorhanden"
                      className="text-xs text-gray-500 dark:text-gray-400 hover:underline"
                    >
                      Verknüpfung lösen
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item)}
                      title="Entfernt den Eintrag ganz aus deiner Sammlung, etwa nach einem Verkauf"
                      className="text-xs text-red-600 dark:text-red-400 hover:underline"
                    >
                      Eintrag löschen
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {target && (
              <div className="mt-4 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    aria-label="Zielkategorie"
                    className={`${selectClass} min-w-0 flex-1 py-1.5`}
                  >
                    {targets.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {hasReverse && (
                    <select
                      value={addVariant}
                      onChange={(e) => setAddVariant(e.target.value as CatalogVariant)}
                      aria-label="Fassung"
                      className={`${selectClass} w-auto py-1.5`}
                    >
                      <option value="normal">Normal</option>
                      <option value="reverse">Reverse Holo</option>
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => void onAdd(target, hasReverse ? addVariant : 'normal')}
                    disabled={!detail}
                    className="rounded-md bg-pokemon-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    In Sammlung übernehmen
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Legt einen Eintrag mit Bild, Cardmarket-Link und dem Katalogpreis als Startwert an. Kaufpreis und
                  Wert pflegst du danach wie gewohnt.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardCatalogSetRoute;
