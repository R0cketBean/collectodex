import React, { useState } from 'react';
import { MinusIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import FallbackImage from '../catalog/FallbackImage';
import { useCategoriesData } from '../../context/CollectionContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useAddCatalogCard } from '../../hooks/useAddCatalogCard';
import { catalogCardImageSources, formatEur } from '../../services/tcgdex';
import type { CatalogVariant } from '../../types/models';
import { stackTotals, unitPrice, type StackEntry } from '../../utils/scanStack';
import { primaryButtonClass, secondaryButtonSmallClass, selectClass } from '../../utils/formStyles';

// Stapel des Kartenscanners (#171): gesammelte Karten mit Anzahl, Fassung und
// Preis, darunter der Gesamtwert. Am Ende alles auf einmal übernehmen.

interface ScanStackProps {
  stack: StackEntry[];
  onQuantity: (key: string, quantity: number) => void;
  onVariant: (key: string, variant: CatalogVariant) => void;
  onRemove: (key: string) => void;
  onRemoveMany: (keys: string[]) => void;
  onClear: () => void;
  onOpen: (entry: StackEntry) => void;
}

const LANG_LABEL = { de: 'DE', en: 'EN', ja: 'JP' } as const;

const ScanStack: React.FC<ScanStackProps> = ({ stack, onQuantity, onVariant, onRemove, onRemoveMany, onClear, onOpen }) => {
  const categories = useCategoriesData();
  const { notify } = useFeedback();
  const addCatalogCard = useAddCatalogCard();
  // Nur Kategorien mit Attributen taugen als Ziel.
  const targets = categories.filter((c) => Array.isArray(c.attributes) && c.attributes.length > 0);
  const [targetId, setTargetId] = useState(() => (targets.find((c) => c.id === 'singles') ?? targets[0])?.id ?? '');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const totals = stackTotals(stack);
  const target = targets.find((c) => c.id === targetId);

  const addAll = async () => {
    if (!target || progress) return;
    const entries = [...stack].reverse(); // in Scan-Reihenfolge
    const added: string[] = [];
    setProgress({ done: 0, total: entries.length });
    for (const e of entries) {
      try {
        await addCatalogCard({
          category: target,
          card: { id: e.cardId, localId: e.localId, name: e.name, image: e.image },
          setId: e.setId,
          setName: e.setName,
          lang: e.lang,
          variant: e.variant,
          price: e.price ?? null,
          strictLanguage: true,
          quantity: e.quantity,
        });
        added.push(e.key);
      } catch {
        // Bleibt im Stapel; unten gemeldet.
      }
      setProgress({ done: added.length, total: entries.length });
    }
    onRemoveMany(added);
    setProgress(null);
    const failed = entries.length - added.length;
    notify(
      `${added.length} ${added.length === 1 ? 'Eintrag' : 'Einträge'} in „${target.name}“ übernommen` +
        (failed > 0 ? ` – ${failed} bleiben im Stapel` : '')
    );
  };

  if (stack.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
        Der Stapel ist leer. Sichere Treffer landen automatisch hier, andere Treffer mit „Zum Stapel“.
      </div>
    );
  }

  return (
    <section aria-label="Stapel" className="rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Stapel · {totals.cards} {totals.cards === 1 ? 'Karte' : 'Karten'}
        </h2>
        <div className="text-right">
          <span className="text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">
            {formatEur(totals.value)}
          </span>
          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
            Trend{totals.unpriced > 0 ? ` · ${totals.unpriced} ohne Preis` : ''}
          </span>
        </div>
      </div>

      <ul className="max-h-[28rem] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700">
        {stack.map((e) => {
          const price = unitPrice(e);
          return (
            <li key={e.key} className="flex items-center gap-3 px-4 py-2">
              <button
                type="button"
                onClick={() => onOpen(e)}
                className="relative aspect-[5/7] w-10 flex-shrink-0 overflow-hidden rounded bg-gray-100 dark:bg-gray-900"
                aria-label={`${e.name} ansehen`}
              >
                <FallbackImage
                  sources={catalogCardImageSources(e.lang, { localId: e.localId, image: e.image }, e.setId, 'low')}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-contain"
                />
              </button>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onOpen(e)}
                  className="block max-w-full truncate text-left text-sm font-medium text-gray-900 hover:underline dark:text-gray-100"
                >
                  {e.name}
                </button>
                <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {LANG_LABEL[e.lang]} · {e.setName} · {e.localId}
                </div>
              </div>
              {(e.hasReverse || e.variant === 'reverse') && (
                <select
                  value={e.variant}
                  onChange={(ev) => onVariant(e.key, ev.target.value as CatalogVariant)}
                  aria-label={`Fassung von ${e.name}`}
                  className={`${selectClass} w-auto py-1 text-xs`}
                >
                  <option value="normal">Normal</option>
                  <option value="reverse">Reverse Holo</option>
                </select>
              )}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onQuantity(e.key, e.quantity - 1)}
                  aria-label={`${e.name}: eine weniger`}
                  className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <MinusIcon className="h-4 w-4" />
                </button>
                <span className="w-6 text-center text-sm tabular-nums text-gray-900 dark:text-gray-100">{e.quantity}</span>
                <button
                  type="button"
                  onClick={() => onQuantity(e.key, e.quantity + 1)}
                  aria-label={`${e.name}: eine mehr`}
                  className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <PlusIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="w-20 text-right text-sm tabular-nums text-gray-900 dark:text-gray-100">
                {e.price === undefined ? '…' : formatEur(price === null ? null : price * e.quantity)}
              </div>
              <button
                type="button"
                onClick={() => onRemove(e.key)}
                aria-label={`${e.name} aus dem Stapel entfernen`}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-700"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
        {target && (
          <>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              aria-label="Zielkategorie"
              className={`${selectClass} w-auto py-1.5`}
              disabled={Boolean(progress)}
            >
              {targets.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void addAll()} disabled={Boolean(progress)} className={primaryButtonClass}>
              {progress ? `Übernehme … ${progress.done}/${progress.total}` : 'Alle in Sammlung übernehmen'}
            </button>
          </>
        )}
        <div className="ml-auto">
          {confirmClear ? (
            <span className="inline-flex items-center gap-2 text-sm">
              <span className="text-gray-600 dark:text-gray-300">Stapel wirklich leeren?</span>
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setConfirmClear(false);
                }}
                className="font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Leeren
              </button>
              <button type="button" onClick={() => setConfirmClear(false)} className="text-gray-500 hover:underline">
                Abbrechen
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={Boolean(progress)}
              className={secondaryButtonSmallClass}
            >
              <TrashIcon className="h-4 w-4" aria-hidden="true" /> Leeren
            </button>
          )}
        </div>
      </div>
      <p className="px-4 pb-3 text-xs text-gray-500 dark:text-gray-400">
        Preise: Cardmarket-Trend über alle Sprachen und Zustände. Übernommen wird je Zeile ein Eintrag mit der Anzahl.
      </p>
    </section>
  );
};

export default ScanStack;
