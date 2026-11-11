import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import FallbackImage from '../components/catalog/FallbackImage';
import { useCategoriesData, useCollectionActions, useItemsData } from '../context/CollectionContext';
import ImageLightbox from '../components/common/ImageLightbox';
import {
  catalogCardImageSources,
  englishCardImageBase,
  fetchSet,
  fetchSetList,
  fetchSetNames,
  mapLimit,
  type SetDetail,
} from '../services/tcgdex';
import { updateCatalogSettings, useCatalogSettings } from '../hooks/useCatalogSettings';
import type { CatalogRef, CollectionItem } from '../types/models';
import { catalogLangOfItem } from '../utils/catalogItem';
import { catalogSetKey, parseCatalogSetKey } from '../utils/catalogOwnership';
import { CATALOG_IMAGE_KEY, getPrimaryImage, type ItemImage } from '../utils/itemImages';
import { firstLoadableImage } from '../utils/imageProbe';
import { selectClass } from '../utils/formStyles';
import {
  candidateSetIds,
  linkCategoryIds,
  linkNumberMatches,
  manualCandidates,
  suggestMatch,
  type CatalogCardName,
  type CatalogSetName,
  type MatchStatus,
  type MatchSuggestion,
} from '../utils/catalogMatch';

// Verknüpft bestehende Sammlungseinträge mit Karten aus dem Katalog (#125).
// Sichere Treffer lassen sich gesammelt übernehmen, unsichere werden einzeln
// zur Auswahl vorgelegt. Verknüpfte Einträge gelten im Katalog als vorhanden.
// Angeboten werden nur Einträge aus Kategorien mit Karten: Sealed-Produkte
// und Zubehör gehören zwar zu einem Set, sind aber keine Katalogkarte.

interface Row {
  item: CollectionItem;
  suggestion: MatchSuggestion;
}

/** Katalogsprache einer Zeile, abgeleitet aus dem Feld „Sprache“ des Eintrags. */
const rowLang = (item: CollectionItem) => catalogLangOfItem(item.values?.language);

const STATUS_LABEL: Record<MatchStatus, string> = {
  sure: 'Sichere Treffer',
  review: 'Bitte prüfen',
  none: 'Kein Treffer',
};

const CatalogLinkAssistant: React.FC = () => {
  const items = useItemsData();
  const categories = useCategoriesData();
  const { setItemCatalogRefs, addImageToItem } = useCollectionActions();
  // Katalogbild beim Verknüpfen als zusätzliches Bild am Eintrag ablegen (nur die Adresse, keine Datei).
  const [adoptImage, setAdoptImage] = useState(true);

  const [sets, setSets] = useState<CatalogSetName[] | null>(null);
  const [cardsBySet, setCardsBySet] = useState<Record<string, CatalogCardName[]>>({});
  const [setNamesById, setSetNamesById] = useState<Record<string, string>>({});
  const [loadingSets, setLoadingSets] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Vom Nutzer gewählte Karte je Eintrag (überschreibt die Vorauswahl).
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  // Vom Nutzer von Hand gewähltes Set je Eintrag (für „Kein Treffer“ oder falsche Vorschläge).
  const [manualSet, setManualSet] = useState<Record<string, string>>({});
  // Von Hand gewähltes Set je Sprache und Erweiterung: gilt für alle Einträge ohne eigenen Treffer mit derselben Erweiterung.
  const [manualByExpansion, setManualByExpansion] = useState<Record<string, string>>({});
  const [japaneseSets, setJapaneseSets] = useState<CatalogSetName[] | null>(null);
  const [serieBySet, setSerieBySet] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<ItemImage[] | null>(null);
  const [done, setDone] = useState(0);
  // Aufgeklappte Abschnitte; „Kein Treffer“ ist anfangs zu.
  const [open, setOpen] = useState<Record<MatchStatus, boolean>>({ sure: true, review: true, none: false });

  const { linkCategories } = useCatalogSettings();
  const scope = useMemo(() => linkCategoryIds(categories, linkCategories), [categories, linkCategories]);
  const scoped = useMemo(() => items.filter((i) => scope.has(i.categoryId)), [items, scope]);
  const unlinked = useMemo(() => scoped.filter((i) => !i.catalog), [scoped]);
  const linkedCount = scoped.length - unlinked.length;
  const countByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) counts[item.categoryId] = (counts[item.categoryId] ?? 0) + 1;
    return counts;
  }, [items]);

  // Japanische Setliste nur laden, wenn es japanische Einträge gibt.
  const hasJapanese = useMemo(() => unlinked.some((i) => rowLang(i) === 'ja'), [unlinked]);
  useEffect(() => {
    if (!hasJapanese || japaneseSets) return;
    let alive = true;
    void fetchSetList('ja').then(
      (data) => alive && setJapaneseSets(data),
      () => alive && setJapaneseSets([])
    );
    return () => {
      alive = false;
    };
  }, [hasJapanese, japaneseSets]);
  // Zuordnen lässt sich erst, wenn alle nötigen Setlisten da sind.
  const ready = Boolean(sets && (!hasJapanese || japaneseSets));

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
    if (sets && ready) {
      for (const item of unlinked) {
        // Deutsche und englische Sets teilen Kennungen und Namen. Japanische
        // haben eigene Kennungen und finden sich über ihren englischen Namen.
        const lang = rowLang(item);
        const pool = lang === 'ja' ? (japaneseSets ?? []) : sets;
        result[item.id] = candidateSetIds(pool, item).map((id) => catalogSetKey(id, lang));
      }
    }
    return result;
  }, [sets, japaneseSets, ready, unlinked]);

  // Lädt ein Set unter seinem Schlüssel (Sprache + Kennung). Englische Karten
  // bekommen zusätzlich den deutschen Namen, weil Einträge oft deutsch benannt sind.
  const loadSet = async (key: string): Promise<{ key: string; set: SetDetail; cards: CatalogCardName[] }> => {
    const { lang, setId } = parseCatalogSetKey(key);
    const set = await fetchSet(setId, lang);
    let cards: CatalogCardName[] = set.cards;
    if (lang === 'en') {
      const german = await fetchSet(setId, 'de').catch(() => null);
      const names = new Map((german?.cards ?? []).map((c) => [c.id, c.name]));
      cards = set.cards.map((c) => ({ ...c, altName: names.get(c.id) }));
    }
    return { key, set, cards };
  };

  const rememberSet = ({ key, set, cards }: { key: string; set: SetDetail; cards: CatalogCardName[] }) => {
    setCardsBySet((prev) => ({ ...prev, [key]: cards }));
    setSetNamesById((prev) => ({ ...prev, [key]: set.name }));
    if (set.serie?.id) setSerieBySet((prev) => ({ ...prev, [key]: set.serie.id }));
  };

  const expansionKey = (item: CollectionItem) =>
    typeof item.values?.expansion === 'string' && item.values.expansion.trim()
      ? `${rowLang(item)}|${item.values.expansion.trim().toLowerCase()}`
      : null;

  // Set von Hand wählen: Karten nachladen, die bisherige Kartenauswahl verwerfen.
  // Die Wahl gilt auch für andere Einträge ohne Treffer mit derselben Erweiterung.
  const chooseSet = (item: CollectionItem, key: string) => {
    setManualSet((prev) => ({ ...prev, [item.id]: key }));
    const group = expansionKey(item);
    if (group && key) setManualByExpansion((prev) => ({ ...prev, [group]: key }));
    setChoice((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    if (key && !cardsBySet[key]) void loadSet(key).then(rememberSet, () => undefined);
  };

  const sortedSets = useMemo(
    () => [...(sets ?? [])].sort((a, b) => a.names[0].localeCompare(b.names[0], 'de', { numeric: true })),
    [sets]
  );

  const neededSetIds = useMemo(
    () => [...new Set(Object.values(setIdsByItem).flat())].sort(),
    [setIdsByItem]
  );
  const neededKey = neededSetIds.join('|');

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const missing = neededSetIds.filter((id) => !cardsBySet[id]);
    if (missing.length === 0) {
      setLoadingSets(false);
      return;
    }
    setLoadingSets(true);
    void mapLimit(missing, 6, async (key) => {
      const loaded = await loadSet(key);
      if (alive) rememberSet(loaded);
    }).then(() => alive && setLoadingSets(false));
    return () => {
      alive = false;
    };
    // Nur neu laden, wenn sich die Menge der benötigten Sets ändert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, neededKey]);

  const rows = useMemo<Row[]>(() => {
    if (!ready) return [];
    return unlinked.map((item) => ({
      item,
      suggestion: suggestMatch(item, setIdsByItem[item.id] ?? [], cardsBySet),
    }));
  }, [ready, unlinked, setIdsByItem, cardsBySet]);

  const groups = useMemo(() => {
    const result: Record<MatchStatus, Row[]> = { sure: [], review: [], none: [] };
    for (const row of rows) result[row.suggestion.status].push(row);
    return result;
  }, [rows]);

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  // Set einer Zeile, das nicht aus einem Kartenvorschlag stammt: die eigene
  // Wahl von Hand, sonst – nur ohne eigenen Treffer – die Wahl für dieselbe
  // Erweiterung, sonst das eine Set, das über Namen oder Link erkannt wurde
  // (die Karte darin ließ sich aber nicht bestimmen).
  const manualSourceOf = (row: Row): { key: string; source: 'own' | 'expansion' | 'detected' } | undefined => {
    if (row.item.id in manualSet) {
      return manualSet[row.item.id] ? { key: manualSet[row.item.id], source: 'own' } : undefined;
    }
    if (row.suggestion.status !== 'none') return undefined;
    const group = expansionKey(row.item);
    if (group && manualByExpansion[group]) return { key: manualByExpansion[group], source: 'expansion' };
    const detected = (setIdsByItem[row.item.id] ?? []).filter((key) => (cardsBySet[key]?.length ?? 0) > 0);
    return detected.length === 1 ? { key: detected[0], source: 'detected' } : undefined;
  };
  const manualOf = (row: Row): string | undefined => manualSourceOf(row)?.key;

  // Kandidaten einer Zeile: aus dem von Hand gewählten Set, sonst die Vorschläge.
  const candidatesOf = (row: Row) => {
    const key = manualOf(row);
    if (!key) return row.suggestion.candidates;
    return cardsBySet[key] ? manualCandidates(row.item, key, cardsBySet[key]) : [];
  };

  const chosen = (row: Row) => {
    const candidates = candidatesOf(row);
    const manual = manualSourceOf(row);
    // Bei einem nur erkannten Set gibt es keine Vorauswahl: Die Karte wählt der Nutzer.
    const preset = !manual ? row.suggestion.best?.card.id : manual.source === 'detected' ? undefined : candidates[0]?.card.id;
    const cardId = choice[row.item.id] ?? preset;
    return candidates.find((c) => c.card.id === cardId);
  };

  // `pick.setId` ist hier der Set-Schlüssel (Sprache + Kennung).
  const imageSourcesOf = (pick: { setId: string; card: CatalogCardName }, quality: 'low' | 'high' = 'low') => {
    const { lang, setId } = parseCatalogSetKey(pick.setId);
    return catalogCardImageSources(
      lang,
      pick.card,
      setId,
      quality,
      englishCardImageBase(serieBySet[pick.setId], setId, pick.card.localId)
    );
  };

  const link = (targets: Row[]) => {
    const refs: Record<string, CatalogRef> = {};
    for (const row of targets) {
      const pick = chosen(row);
      if (!pick) continue;
      const { lang, setId } = parseCatalogSetKey(pick.setId);
      refs[row.item.id] = { cardId: pick.card.id, setId, variant: 'normal', ...(lang !== 'de' ? { lang } : {}) };
    }
    setItemCatalogRefs(refs);
    setDone((n) => n + Object.keys(refs).length);
    if (!adoptImage) return;
    // Bilder im Hintergrund nachtragen; es zählt nur eine Adresse, die sich laden lässt.
    const picks = targets
      .map((row) => ({ id: row.item.id, has: Boolean(row.item.images?.[CATALOG_IMAGE_KEY]), pick: chosen(row) }))
      .filter((p) => p.pick && !p.has);
    void mapLimit(picks, 4, async ({ id, pick }) => {
      const url = pick && (await firstLoadableImage(imageSourcesOf(pick, 'high')));
      if (url) addImageToItem(id, CATALOG_IMAGE_KEY, url);
    });
  };

  const renderRow = (row: Row) => {
    const pick = chosen(row);
    const { item, suggestion } = row;
    const ownImage = getPrimaryImage(item.images);
    const candidates = candidatesOf(row);
    const lang = rowLang(item);
    const manual = manualSourceOf(row);
    const manualKey = manual?.key;
    const selectedSet = manualKey ?? pick?.setId ?? '';
    const setOptions = lang === 'ja' ? (japaneseSets ?? []) : sortedSets;
    const severalSets = new Set(candidates.map((c) => c.setId)).size > 1;
    // Großansicht: Katalogkarte (erste Quelle, die sich laden lässt) und eigenes Foto.
    const openZoom = async () => {
      const catalogUrl = pick ? await firstLoadableImage(imageSourcesOf(pick, 'high')) : undefined;
      const images: ItemImage[] = [
        ...(catalogUrl ? [{ key: 'catalog', label: 'Katalogkarte', data: catalogUrl }] : []),
        ...(ownImage ? [{ key: 'own', label: 'Dein Foto', data: ownImage }] : []),
      ];
      if (images.length > 0) setZoom(images);
    };
    const canZoom = Boolean(pick || ownImage);
    return (
      <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => void openZoom()}
          disabled={!canZoom}
          title="Bild vergrößern"
          aria-label={`Bild zu ${String(item.values?.name ?? 'Eintrag')} vergrößern`}
          className="h-20 w-14 flex-shrink-0 rounded bg-gray-100 dark:bg-gray-900 overflow-hidden flex items-center justify-center enabled:cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-pokemon-blue"
        >
          {/* Katalogbild (deutsch, sonst englisch); fehlt beides, das eigene Foto des Eintrags. */}
          <FallbackImage
            key={pick?.card.id ?? 'none'}
            sources={[
              ...(pick ? imageSourcesOf(pick) : []),
              ...(ownImage ? [{ url: ownImage, lang: 'de' as const }] : []),
            ]}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain"
          />
        </button>
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
        <div className="min-w-0 flex-1 basis-64 space-y-1.5 text-sm">
          <select
            value={selectedSet}
            onChange={(e) => chooseSet(item, e.target.value)}
            aria-label={`Set für ${String(item.values?.name ?? 'Eintrag')}`}
            className={`${selectClass} py-1.5`}
          >
            <option value="">{lang === 'ja' ? 'Japanisches Set wählen…' : 'Set wählen…'}</option>
            {setOptions.map((s) => (
              <option key={s.id} value={catalogSetKey(s.id, lang)}>
                {lang === 'ja' ? `${s.id} · ${s.names[0]}` : s.names[0]}
                {s.names[1] && s.names[1] !== s.names[0] ? ` (${s.names[1]})` : ''}
              </option>
            ))}
          </select>
          {manualKey && !cardsBySet[manualKey] ? (
            <span className="text-gray-500 dark:text-gray-400">Karten werden geladen…</span>
          ) : candidates.length > 1 || (candidates.length === 1 && !pick) ? (
            <select
              value={pick?.card.id ?? ''}
              onChange={(e) => setChoice((prev) => ({ ...prev, [item.id]: e.target.value }))}
              aria-label={`Katalogkarte für ${String(item.values?.name ?? 'Eintrag')}`}
              className={`${selectClass} py-1.5`}
            >
              {!pick && (
                <option value="" disabled>
                  Karte wählen…
                </option>
              )}
              {candidates.map((c) => (
                <option key={c.card.id} value={c.card.id}>
                  Nr. {c.card.localId} · {c.card.name}
                  {severalSets ? ` · ${setNamesById[c.setId] ?? c.setId}` : ''}
                </option>
              ))}
            </select>
          ) : pick ? (
            <div className="text-gray-900 dark:text-gray-100">
              Nr. {pick.card.localId} · {pick.card.name}
            </div>
          ) : manualKey ? (
            <span className="text-gray-500 dark:text-gray-400">Für dieses Set liegen keine Karten vor.</span>
          ) : null}
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {!manual
              ? suggestion.reason
              : manual.source === 'own'
                ? 'Von Hand gewählt'
                : manual.source === 'expansion'
                  ? 'Set von gleicher Erweiterung übernommen'
                  : 'Set erkannt, Karte bitte wählen'}
          </div>
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

  // Ein Abschnitt je Trefferart, über die Überschrift ein- und ausklappbar.
  // Die Aktionen rechts bleiben auch eingeklappt erreichbar.
  const section = (status: MatchStatus, actions?: React.ReactNode, intro?: React.ReactNode) => {
    const list = groups[status].filter((r) => !skipped[r.item.id]);
    if (list.length === 0) return null;
    const isOpen = open[status];
    return (
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            <button
              type="button"
              onClick={() => setOpen((prev) => ({ ...prev, [status]: !prev[status] }))}
              aria-expanded={isOpen}
              aria-controls={`verknuepfen-${status}`}
              className="inline-flex items-center gap-1.5 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-pokemon-blue"
            >
              <ChevronRightIcon
                className={`h-5 w-5 flex-shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                aria-hidden="true"
              />
              {STATUS_LABEL[status]}
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">({list.length})</span>
            </button>
          </h2>
          {actions}
        </div>
        {isOpen && (
          <div id={`verknuepfen-${status}`}>
            {intro}
            <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow">
              {list.map(renderRow)}
            </ul>
          </div>
        )}
      </section>
    );
  };

  const sureOpen = groups.sure.filter((r) => !skipped[r.item.id]);
  // Ohne automatischen Treffer, aber mit von Hand gewähltem Set und einer Karte,
  // deren Nummer zum Cardmarket-Link passt: gefahrlos gesammelt verknüpfbar.
  const manualByNumber = groups.none.filter((r) => {
    const pick = !skipped[r.item.id] && manualOf(r) ? chosen(r) : undefined;
    return Boolean(pick && linkNumberMatches(r.item, pick.card, pick.setId));
  });

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
        <label className="mt-3 flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            checked={adoptImage}
            onChange={(e) => setAdoptImage(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-pokemon-blue focus:ring-pokemon-blue"
          />
          <span>
            Katalogbild als zusätzliches Bild am Eintrag ablegen
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Dein eigenes Foto bleibt das Hauptbild. Gespeichert wird nur die Internetadresse, es entsteht keine
              Bilddatei.
            </span>
          </span>
        </label>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-gray-900 dark:text-gray-100">Kategorien mit Karten</legend>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Nur Einträge aus diesen Kategorien werden zugeordnet. Sealed-Produkte und Zubehör gehören zwar zu einem
            Set, sind aber keine Karte aus dem Katalog.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
            {categories.map((c) => (
              <label key={c.id} className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={scope.has(c.id)}
                  onChange={(e) => updateCatalogSettings({ linkCategories: { ...linkCategories, [c.id]: e.target.checked } })}
                  className="h-4 w-4 rounded border-gray-300 text-pokemon-blue focus:ring-pokemon-blue"
                />
                {c.name}
                <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">({countByCategory[c.id] ?? 0})</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-4 text-sm text-gray-700 dark:text-gray-200 tabular-nums" aria-live="polite">
          {linkedCount} von {scoped.length} Karten-Einträgen verknüpft
          {done > 0 && ` · ${done} gerade eben`}
        </p>

        {error && (
          <p className="mt-6 rounded-lg bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-700 dark:text-red-300">{error}</p>
        )}
        {!error && (!ready || loadingSets) && (
          <p className="mt-6 text-sm text-gray-500 dark:text-gray-400" aria-busy="true">
            Sets werden geladen…
          </p>
        )}

        {ready && !loadingSets && unlinked.length === 0 && (
          <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
            {scoped.length === 0 ? 'In den gewählten Kategorien gibt es keine Einträge.' : 'Alle Einträge sind verknüpft.'}
          </p>
        )}

        {ready && !loadingSets && (
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
            {section(
              'none',
              manualByNumber.length > 0 && (
                <button
                  type="button"
                  onClick={() => link(manualByNumber)}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                >
                  {manualByNumber.length} mit passender Kartennummer verknüpfen
                </button>
              ),
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Karten, deren Set oder Nummer sich nicht erkennen ließ. Wähle Set und Karte von Hand; bei japanischen
                Karten stehen die japanischen Sets mit ihrem englischen Namen zur Auswahl. Die Wahl gilt gleich für
                alle Einträge mit derselben Erweiterung.
              </p>
            )}
          </>
        )}
      </div>
      {zoom && <ImageLightbox images={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
};

export default CatalogLinkAssistant;
