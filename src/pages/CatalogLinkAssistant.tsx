import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import FallbackImage from '../components/catalog/FallbackImage';
import { useCategoriesData, useCollectionActions, useItemsData } from '../context/CollectionContext';
import { cardImageSources, fetchSet, fetchSetNames, mapLimit } from '../services/tcgdex';
import type { CatalogRef, CollectionItem } from '../types/models';
import { getPrimaryImage } from '../utils/itemImages';
import {
  candidateSetIds,
  suggestMatch,
  type CatalogCardName,
  type CatalogSetName,
  type MatchStatus,
  type MatchSuggestion,
} from '../utils/catalogMatch';

// Verknüpft bestehende Sammlungseinträge mit Karten aus dem Katalog (#125).
// Sichere Treffer lassen sich gesammelt übernehmen, unsichere werden einzeln
// zur Auswahl vorgelegt. Verknüpfte Einträge gelten im Katalog als vorhanden.

interface Row {
  item: CollectionItem;
  suggestion: MatchSuggestion;
}

const STATUS_LABEL: Record<MatchStatus, string> = {
  sure: 'Sichere Treffer',
  review: 'Bitte prüfen',
  none: 'Kein Treffer',
};

const CatalogLinkAssistant: React.FC = () => {
  const items = useItemsData();
  const categories = useCategoriesData();
  const { setItemCatalogRefs } = useCollectionActions();

  const [sets, setSets] = useState<CatalogSetName[] | null>(null);
  const [cardsBySet, setCardsBySet] = useState<Record<string, CatalogCardName[]>>({});
  const [setNamesById, setSetNamesById] = useState<Record<string, string>>({});
  const [loadingSets, setLoadingSets] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Vom Nutzer gewählte Karte je Eintrag (überschreibt die Vorauswahl).
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState(0);

  const unlinked = useMemo(() => items.filter((i) => !i.catalog), [items]);
  const linkedCount = items.length - unlinked.length;

  useEffect(() => {
    let alive = true;
    fetchSetNames()
      .then((data) => alive && setSets(data))
      .catch(() => alive && setError('Der Katalog konnte nicht geladen werden. Bist du online?'));
    return () => {
      alive = false;
    };
  }, []);

  // Mögliche Sets je Eintrag; daraus ergibt sich, welche Sets geladen werden müssen.
  const setIdsByItem = useMemo(() => {
    const result: Record<string, string[]> = {};
    if (sets) for (const item of unlinked) result[item.id] = candidateSetIds(sets, item);
    return result;
  }, [sets, unlinked]);

  const neededSetIds = useMemo(
    () => [...new Set(Object.values(setIdsByItem).flat())].sort(),
    [setIdsByItem]
  );
  const neededKey = neededSetIds.join('|');

  useEffect(() => {
    if (!sets) return;
    let alive = true;
    const missing = neededSetIds.filter((id) => !cardsBySet[id]);
    if (missing.length === 0) {
      setLoadingSets(false);
      return;
    }
    setLoadingSets(true);
    void mapLimit(missing, 6, async (id) => {
      const set = await fetchSet(id);
      if (!alive) return;
      setCardsBySet((prev) => ({ ...prev, [id]: set.cards }));
      setSetNamesById((prev) => ({ ...prev, [id]: set.name }));
    }).then(() => alive && setLoadingSets(false));
    return () => {
      alive = false;
    };
    // Nur neu laden, wenn sich die Menge der benötigten Sets ändert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets, neededKey]);

  const rows = useMemo<Row[]>(() => {
    if (!sets) return [];
    return unlinked.map((item) => ({
      item,
      suggestion: suggestMatch(item, setIdsByItem[item.id] ?? [], cardsBySet),
    }));
  }, [sets, unlinked, setIdsByItem, cardsBySet]);

  const groups = useMemo(() => {
    const result: Record<MatchStatus, Row[]> = { sure: [], review: [], none: [] };
    for (const row of rows) result[row.suggestion.status].push(row);
    return result;
  }, [rows]);

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  const chosen = (row: Row) => {
    const cardId = choice[row.item.id] ?? row.suggestion.best?.card.id;
    return row.suggestion.candidates.find((c) => c.card.id === cardId);
  };

  const link = (targets: Row[]) => {
    const refs: Record<string, CatalogRef> = {};
    for (const row of targets) {
      const pick = chosen(row);
      if (pick) refs[row.item.id] = { cardId: pick.card.id, setId: pick.setId, variant: 'normal' };
    }
    setItemCatalogRefs(refs);
    setDone((n) => n + Object.keys(refs).length);
  };

  const renderRow = (row: Row) => {
    const pick = chosen(row);
    const { item, suggestion } = row;
    const ownImage = getPrimaryImage(item.images);
    return (
      <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="h-16 w-12 flex-shrink-0 rounded bg-gray-100 dark:bg-gray-900 overflow-hidden flex items-center justify-center">
          {/* Katalogbild; fehlt es (ältere Sets), das eigene Foto des Eintrags. */}
          <FallbackImage
            sources={[
              ...(pick ? cardImageSources(pick.card.image, undefined) : []),
              ...(ownImage ? [{ url: ownImage, lang: 'de' as const }] : []),
            ]}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain"
          />
        </div>
        <div className="min-w-0 flex-1 basis-48">
          <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {String(item.values?.name ?? 'Ohne Namen')}
          </div>
          <div className="truncate text-xs text-gray-500 dark:text-gray-400">
            {categoryName(item.categoryId)}
            {item.values?.expansion ? ` · ${item.values.expansion}` : ''}
            {item.values?.language ? ` · ${item.values.language}` : ''}
          </div>
        </div>
        <div className="min-w-0 flex-1 basis-56 text-sm">
          {suggestion.candidates.length > 1 ? (
            <select
              value={pick?.card.id ?? ''}
              onChange={(e) => setChoice((prev) => ({ ...prev, [item.id]: e.target.value }))}
              aria-label={`Katalogkarte für ${String(item.values?.name ?? 'Eintrag')}`}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
            >
              {suggestion.candidates.map((c) => (
                <option key={c.card.id} value={c.card.id}>
                  {c.card.name} · {setNamesById[c.setId] ?? c.setId} · Nr. {c.card.localId}
                </option>
              ))}
            </select>
          ) : pick ? (
            <span className="text-gray-900 dark:text-gray-100">
              {pick.card.name} · {setNamesById[pick.setId] ?? pick.setId} · Nr. {pick.card.localId}
            </span>
          ) : null}
          <div className="text-xs text-gray-500 dark:text-gray-400">{suggestion.reason}</div>
        </div>
        {pick && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => link([row])}
              className="rounded-md bg-pokemon-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Verknüpfen
            </button>
            <button
              type="button"
              onClick={() => setSkipped((prev) => ({ ...prev, [item.id]: true }))}
              className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Überspringen
            </button>
          </div>
        )}
      </li>
    );
  };

  const section = (status: MatchStatus, extra?: React.ReactNode) => {
    const list = groups[status].filter((r) => !skipped[r.item.id]);
    if (list.length === 0) return null;
    return (
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {STATUS_LABEL[status]} <span className="text-sm font-normal text-gray-500 dark:text-gray-400">({list.length})</span>
          </h2>
          {extra}
        </div>
        <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow">
          {list.map(renderRow)}
        </ul>
      </section>
    );
  };

  const sureOpen = groups.sure.filter((r) => !skipped[r.item.id]);

  return (
    <div className="py-6">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8">
        <Link to="/katalog" className="inline-flex items-center text-sm text-pokemon-blue dark:text-blue-300 hover:underline">
          <ArrowLeftIcon className="h-4 w-4 mr-1" /> Kartenkatalog
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Sammlung mit dem Katalog verknüpfen</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Verknüpfte Einträge gelten im Katalog als vorhanden und zählen mit ihrem gepflegten Wert zum Set. An deinen
          Einträgen ändert sich sonst nichts.
        </p>
        <p className="mt-3 text-sm text-gray-700 dark:text-gray-200 tabular-nums" aria-live="polite">
          {linkedCount} von {items.length} Einträgen verknüpft
          {done > 0 && ` · ${done} gerade eben`}
        </p>

        {error && (
          <p className="mt-6 rounded-lg bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-700 dark:text-red-300">{error}</p>
        )}
        {!error && (!sets || loadingSets) && (
          <p className="mt-6 text-sm text-gray-500 dark:text-gray-400" aria-busy="true">
            Sets werden geladen…
          </p>
        )}

        {sets && !loadingSets && unlinked.length === 0 && (
          <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">Alle Einträge sind verknüpft.</p>
        )}

        {sets && !loadingSets && (
          <>
            {section(
              'sure',
              <button
                type="button"
                onClick={() => link(sureOpen)}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
              >
                Alle {sureOpen.length} verknüpfen
              </button>
            )}
            {section('review')}
            {groups.none.length > 0 && (
              <details className="mt-8">
                <summary className="cursor-pointer text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {STATUS_LABEL.none}{' '}
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400">({groups.none.length})</span>
                </summary>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Meist Sealed-Produkte, Zubehör oder Karten aus Sets, die es nicht auf Deutsch gibt (etwa japanische).
                </p>
                <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow">
                  {groups.none.map(renderRow)}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CatalogLinkAssistant;
