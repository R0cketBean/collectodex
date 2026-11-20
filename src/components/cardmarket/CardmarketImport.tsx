// Import von Cardmarket-Bestellungen (PDF „Einkauf #…“) mit Vorschau.
//
// Ablauf: PDFs wählen → Text auslesen und Bestellungen erkennen → je Zeile
// Katalogkarte und vorhandenen Eintrag suchen → Vorschau mit Vorschlag je
// Zeile, den der Nutzer ändern kann → Übernehmen in EINEM State-Update, mit
// „Rückgängig“.

import React, { useMemo, useState } from 'react';
import { ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useCategoriesData, useCollectionActions, useItemsData } from '../../context/CollectionContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useCatalogSettings } from '../../hooks/useCatalogSettings';
import { extractPdfText } from '../../services/cardmarketPdf';
import { parseCardmarketOrder, type CardmarketOrder } from '../../services/cardmarketOrder';
import {
  cardmarketProductUrl,
  catalogCardImageSources,
  fetchCard,
  fetchSet,
  fetchSetsByCode,
  summarizePricing,
} from '../../services/tcgdex';
import type { CollectionItem } from '../../types/models';
import { buildCatalogItem } from '../../utils/catalogItem';
import { buildCardmarketFilter, pickCatalogPrice } from '../../utils/catalogSettings';
import {
  ACTION_LABEL,
  allowedActions,
  applyImport,
  conditionWord,
  languageWord,
  orderValues,
  planImport,
  type CatalogLookup,
  type FieldKey,
  type ImportAction,
  type ImportRow,
  type NewItemDraft,
} from '../../utils/cardmarketImport';
import { primaryButtonClass, secondaryButtonClass, selectClass } from '../../utils/formStyles';
import { firstLoadableImage } from '../../utils/imageProbe';
import { logger } from '../../utils/logger';

const lookup: CatalogLookup = {
  setsByCode: (code, lang) => fetchSetsByCode(code, lang),
  setCards: async (setId, lang) => {
    const set = await fetchSet(setId, lang);
    return { name: set.name, cards: set.cards };
  },
};

const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const lines = (n: number) => `${n} ${n === 1 ? 'Zeile' : 'Zeilen'}`;
const germanDate = (iso: string | null) => (iso ? iso.split('-').reverse().join('.') : '–');

type Phase = 'idle' | 'reading' | 'review' | 'applying';

const CardmarketImport: React.FC = () => {
  const categories = useCategoriesData();
  const items = useItemsData();
  const { setItems } = useCollectionActions();
  const { notify } = useFeedback();
  const settings = useCatalogSettings();

  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState('');
  const [orders, setOrders] = useState<CardmarketOrder[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);

  const reset = () => {
    setPhase('idle');
    setRows([]);
    setOrders([]);
    setFileErrors([]);
    setProgress('');
  };

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setPhase('reading');
    const errors: string[] = [];
    const found = new Map<string, CardmarketOrder>();
    for (const [index, file] of files.entries()) {
      setProgress(`Lese ${file.name} (${index + 1}/${files.length}) …`);
      try {
        const order = parseCardmarketOrder(await extractPdfText(await file.arrayBuffer()));
        if (order.lines.length === 0) errors.push(`${file.name}: keine Artikel gefunden`);
        else found.set(order.orderId, order);
      } catch (error) {
        logger.warn('Cardmarket-PDF nicht lesbar', file.name, error);
        errors.push(`${file.name}: ${error instanceof Error ? error.message : 'nicht lesbar'}`);
      }
    }
    const list = [...found.values()].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    setFileErrors(errors);
    if (list.length === 0) {
      setPhase('idle');
      notify('Keine Cardmarket-Bestellung erkannt.', { kind: 'error' });
      return;
    }
    const planned = await planImport(list, items, categories, lookup, (done, total) =>
      setProgress(`Gleiche Karten ab (${done}/${total}) …`)
    );
    setOrders(list);
    setRows(planned);
    setPhase('review');
  };

  const setAction = (key: string, action: ImportAction) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, action } : r)));

  /** Häkchen je Feld; ein Häkchen bei „Überspringen“ schaltet auf „Felder anpassen“. */
  const togglePick = (key: string, field: FieldKey) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const active = r.action !== 'skip' && r.action !== 'create';
        const picks =
          active && r.picks.includes(field) ? r.picks.filter((f) => f !== field) : [...new Set([...r.picks, field])];
        const action = picks.length > 0 && (r.action === 'skip' || r.action === 'create') ? 'update' : r.action;
        return { ...r, picks, action };
      })
    );

  const counts = useMemo(() => {
    const c: Record<ImportAction, number> = { create: 0, update: 0, addQuantity: 0, skip: 0 };
    for (const r of rows) c[r.action] += 1;
    return c;
  }, [rows]);

  /** Stellt die Daten für neue Einträge zusammen (Bild, Katalogpreis, Cardmarket-Link). */
  const buildDraft = async (row: ImportRow): Promise<NewItemDraft | null> => {
    const category = categories.find((c) => c.id === row.categoryId);
    if (!category) return null;
    const { hit } = row;
    if (!hit) return { values: orderValues(category, row) };
    const detail = await fetchCard(hit.cardId, undefined, hit.lang).catch(() => null);
    const price = detail ? summarizePricing(detail) : null;
    const image = await firstLoadableImage(
      catalogCardImageSources(hit.lang, { image: hit.image, localId: hit.localId }, hit.setId, 'high')
    );
    const draft = buildCatalogItem(category, {
      cardId: hit.cardId,
      setId: hit.setId,
      setName: hit.setName,
      lang: hit.lang,
      name: hit.name,
      localId: hit.localId,
      variant: 'normal',
      price: pickCatalogPrice(price, settings.priceBasis, 'normal'),
      imageUrl: image,
      // Sprache steht in der Bestellung fest: Link immer danach filtern.
      productUrl: cardmarketProductUrl(price?.idProduct, hit.name, buildCardmarketFilter(settings, hit.lang, true)),
      quantity: row.line.quantity,
    });
    return { ...draft, values: orderValues(category, row, draft.values) };
  };

  const handleApply = async () => {
    setPhase('applying');
    const toCreate = rows.filter((r) => r.action === 'create');
    const drafts = new Map<string, NewItemDraft>();
    for (const [index, row] of toCreate.entries()) {
      setProgress(`Bereite neue Einträge vor (${index + 1}/${toCreate.length}) …`);
      const draft = await buildDraft(row).catch((error) => {
        logger.warn('Entwurf für Cardmarket-Zeile fehlgeschlagen', row.key, error);
        const category = categories.find((c) => c.id === row.categoryId);
        return category ? { values: orderValues(category, row) } : null;
      });
      if (draft) drafts.set(row.key, draft);
    }
    // Die Vorschau sperrt die übrige App, `items` ist also noch aktuell.
    const previous: CollectionItem[] = items;
    const applied = applyImport(previous, rows, drafts);
    setItems(applied.items);
    reset();
    notify(`Cardmarket-Import: ${applied.created} neu angelegt, ${applied.updated} aktualisiert.`, {
      kind: 'success',
      undo: () => setItems(previous),
    });
  };

  const busy = phase === 'reading' || phase === 'applying';

  return (
    <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
      <h3 className="font-medium mb-2 text-sm">Cardmarket-Bestellungen</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Lade die PDFs deiner Käufe von Cardmarket hoch („Einkauf #…“, mehrere auf einmal möglich). Gekaufte Karten
        bekommen ihren Artikelpreis als Kaufpreis; fehlende Karten werden angelegt. Vor dem Übernehmen siehst du
        jede Zeile und entscheidest selbst.
      </p>
      <label htmlFor="cardmarket-pdf-upload" className={`${primaryButtonClass} w-full ${busy ? 'opacity-60' : ''}`}>
        <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
        {busy ? progress || 'Bitte warten …' : 'Bestell-PDFs auswählen'}
      </label>
      <input
        id="cardmarket-pdf-upload"
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="sr-only"
        onChange={handleFiles}
        disabled={busy}
      />

      {(phase === 'review' || phase === 'applying') && (
        <div className="fixed z-20 inset-0 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Cardmarket-Import prüfen">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Cardmarket-Import prüfen</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {orders.length} {orders.length === 1 ? 'Bestellung' : 'Bestellungen'}, {lines(rows.length)} ·{' '}
                  {counts.create} neu · {counts.update} anpassen · {counts.addQuantity} Anzahl · {counts.skip} übersprungen
                </p>
              </div>
              <button onClick={reset} disabled={phase === 'applying'} aria-label="Schließen" className="p-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {fileErrors.length > 0 && (
              <ul className="mx-4 mt-3 text-xs text-red-700 dark:text-red-300 list-disc pl-5">
                {fileErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}

            <div className="overflow-y-auto p-4 space-y-5">
              {orders.map((order) => (
                <section key={order.orderId}>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                    Einkauf #{order.orderId} · {germanDate(order.date)}
                    {order.seller ? ` · ${order.seller}` : ''}
                    {order.itemValue !== undefined ? ` · Artikelwert ${euro(order.itemValue)}` : ''}
                  </h3>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {rows
                        .filter((r) => r.orderId === order.orderId)
                        .map((row) => (
                          <React.Fragment key={row.key}>
                          <tr className={row.action === 'skip' ? 'opacity-60' : ''}>
                            <td className="py-1.5 pr-2 w-8 text-right tabular-nums align-top">{row.line.quantity}×</td>
                            <td className="py-1.5 pr-2 align-top">
                              <div className="font-medium text-gray-900 dark:text-gray-100">
                                {row.line.kind === 'sealed' ? row.line.name : row.hit?.name ?? row.line.name}
                                {row.line.number ? <span className="text-gray-500"> #{row.line.number}</span> : null}
                              </div>
                              <div className="text-gray-500 dark:text-gray-400">
                                {[row.hit?.setName ?? row.line.setCode, languageWord(row.line.language), conditionWord(row.line.condition)]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums whitespace-nowrap align-top">{euro(row.line.unitPrice)}</td>
                            <td className="py-1.5 pr-2 text-gray-600 dark:text-gray-300 align-top">
                              {row.note}
                              {row.existing ? (
                                <div className="text-gray-400">
                                  Eintrag: {String(row.existing.values?.name ?? '')} ({Number(row.existing.values?.quantity) || 0}×)
                                </div>
                              ) : null}
                            </td>
                            <td className="py-1.5 w-44 align-top">
                              <select
                                aria-label={`Aktion für ${row.line.name}`}
                                className={`${selectClass} !py-1 !text-xs`}
                                value={row.action}
                                disabled={phase === 'applying'}
                                onChange={(e) => setAction(row.key, e.target.value as ImportAction)}
                              >
                                {allowedActions(row).map((a) => (
                                  <option key={a} value={a}>
                                    {ACTION_LABEL[a]}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                          {row.fields.length > 0 && (
                            <tr className="!border-t-0">
                              <td />
                              <td colSpan={4} className="pb-2">
                                <table
                                  className="w-full text-xs rounded border border-gray-200 dark:border-gray-700"
                                  aria-label={`Vergleich für ${row.line.name}`}
                                >
                                  <thead className="text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/40">
                                    <tr>
                                      <th className="text-left font-normal px-2 py-1 w-28">Feld</th>
                                      <th className="text-left font-normal px-2 py-1">In der Sammlung</th>
                                      <th className="text-left font-normal px-2 py-1">Laut Rechnung</th>
                                      <th className="text-right font-normal px-2 py-1 w-24">übernehmen</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.fields.map((field) => {
                                      const blocked =
                                        row.action === 'addQuantity' && (field.key === 'quantity' || field.key === 'purchasePrice');
                                      return (
                                        <tr key={field.key} className={field.equal ? 'text-gray-400 dark:text-gray-500' : ''}>
                                          <td className="px-2 py-1">{field.label}</td>
                                          <td className="px-2 py-1">{field.current}</td>
                                          <td className={`px-2 py-1 ${field.equal ? '' : 'font-medium text-amber-700 dark:text-amber-300'}`}>
                                            {field.incoming}
                                          </td>
                                          <td className="px-2 py-1 text-right">
                                            {field.equal ? (
                                              <span>gleich</span>
                                            ) : blocked ? (
                                              <span title="Wird beim Erhöhen der Anzahl verrechnet">verrechnet</span>
                                            ) : (
                                              <input
                                                type="checkbox"
                                                aria-label={`${field.label} übernehmen`}
                                                checked={row.picks.includes(field.key) && row.action !== 'skip' && row.action !== 'create'}
                                                disabled={phase === 'applying'}
                                                onChange={() => togglePick(row.key, field.key)}
                                              />
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                        ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={reset} disabled={phase === 'applying'} className={secondaryButtonClass}>
                Abbrechen
              </button>
              <button
                onClick={handleApply}
                disabled={phase === 'applying' || rows.length === counts.skip}
                className={primaryButtonClass}
              >
                {phase === 'applying' ? progress || 'Übernehme …' : `${lines(rows.length - counts.skip)} übernehmen`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CardmarketImport;
