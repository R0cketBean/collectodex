import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowPathIcon, CameraIcon, CheckBadgeIcon, PhotoIcon, VideoCameraIcon } from '@heroicons/react/24/outline';
import FallbackImage from '../components/catalog/FallbackImage';
import LiveCamera from '../components/scanner/LiveCamera';
import { findScanCandidates } from '../services/cardScan';
import { catalogCardImageSources } from '../services/tcgdex';
import type { OcrResult } from '../types/electron';
import { isConfident, parseScan, type RankedCandidate, type ScanInfo } from '../utils/cardScan';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonSmallClass } from '../utils/formStyles';

// Kartenscanner (#168): Foto einer Karte ablegen, die Texterkennung (Apple
// Vision, auf dem Mac) liest Set-Code, Nummer und Namen, der Katalog liefert
// passende Karten. Ein Klick öffnet die Karte im Katalog; hinzugefügt wird
// dort wie gewohnt, mit Variante und Kategorie.
// Live-Kamera (#169): statt eines Fotos das Kamerabild, z. B. vom iPhone.

type Mode = 'photo' | 'camera';
const MODE_KEY = 'collectodex_scanner_mode';
const readMode = (): Mode => {
  try {
    return localStorage.getItem(MODE_KEY) === 'camera' ? 'camera' : 'photo';
  } catch {
    return 'photo';
  }
};

type Phase = 'idle' | 'reading' | 'searching' | 'done' | 'error';

const ACCEPT = 'image/jpeg,image/png,image/heic,image/heif,image/webp,image/tiff,.heic,.heif';

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Datei nicht lesbar'));
    reader.readAsDataURL(file);
  });

// HEIC-Dateien meldet macOS teils ohne Typ; dann hilft die Endung.
const withImageType = (dataUrl: string, fileName: string) =>
  dataUrl.startsWith('data:application/octet-stream') || dataUrl.startsWith('data:;')
    ? dataUrl.replace(/^data:[^;]*;/, `data:image/${/\.heif$/i.test(fileName) ? 'heif' : 'heic'};`)
    : dataUrl;

const MATCH_LABEL: Record<RankedCandidate['matches'][number], string> = {
  code: 'Set-Code',
  number: 'Nummer',
  total: 'Set-Größe',
  name: 'Name',
};

const describeInfo = (info: ScanInfo) =>
  [
    [info.setCode, info.lang].filter(Boolean).join(' '),
    info.number ? `${info.number}${info.total ? `/${info.total}` : ''}` : '',
    info.name ?? '',
  ].filter(Boolean);

const Scanner: React.FC = () => {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [info, setInfo] = useState<ScanInfo>({});
  const [draft, setDraft] = useState<ScanInfo>({});
  const [results, setResults] = useState<RankedCandidate[]>([]);
  const [dragging, setDragging] = useState(false);
  const [mode, setModeState] = useState<Mode>(readMode);
  // Live-Kamera: Hinweis, wenn eine Aufnahme nichts Lesbares enthielt.
  const [hint, setHint] = useState<string | null>(null);
  const settledPhase = useRef<Phase>('idle');
  // Reverse Holo ist auf dem Foto nicht vom normalen Druck zu unterscheiden
  // (gleicher Text) – deshalb von Hand; bleibt für einen ganzen Stapel an.
  const [reverse, setReverse] = useState(false);

  const setMode = (next: Mode) => {
    setModeState(next);
    setHint(null);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Nur eine Bequemlichkeit.
    }
  };

  useEffect(() => {
    const check = window.electronAPI?.isScannerAvailable;
    if (!check) {
      setAvailable(false);
      return;
    }
    check()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);

  const search = useCallback(async (next: ScanInfo) => {
    setInfo(next);
    setDraft(next);
    setPhase('searching');
    try {
      const found = await findScanCandidates(next);
      setInfo(found.info);
      setDraft(found.info);
      setResults(found.candidates);
      setPhase('done');
    } catch {
      setError('Der Kartenkatalog ist gerade nicht erreichbar.');
      setPhase('error');
    }
  }, []);

  const scanDataUrl = useCallback(
    async (dataUrl: string, fromCamera: boolean) => {
      const recognize = window.electronAPI?.recognizeCard;
      if (!recognize) return;
      setError(null);
      setHint(null);
      if (!fromCamera) {
        setResults([]);
        setOcr(null);
        setPreview(null);
      }
      setPhase((p) => {
        if (p !== 'reading' && p !== 'searching') settledPhase.current = p;
        return 'reading';
      });
      try {
        const result = await recognize(dataUrl);
        const parsed = parseScan(result.lines);
        // Kamera: Aufnahme ohne lesbare Karte (Hand im Bild, leerer Tisch)
        // still übergehen und das letzte Ergebnis stehen lassen.
        if (fromCamera && !parsed.number && !parsed.name) {
          setHint('Keine Karte erkannt – lege sie gerade in den Rahmen und halte still.');
          setPhase(settledPhase.current);
          return;
        }
        setOcr(result);
        setPreview(result.preview ?? (dataUrl.startsWith('data:image/heic') ? null : dataUrl));
        if (fromCamera) setResults([]);
        if (!parsed.number && !parsed.name) {
          setInfo(parsed);
          setDraft(parsed);
          setError('Auf dem Foto war keine Kartennummer und kein Name lesbar. Trage sie unten selbst ein oder nimm ein schärferes Foto auf.');
          setPhase('error');
          return;
        }
        await search(parsed);
      } catch (e) {
        setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e));
        setPhase('error');
      }
    },
    [search]
  );

  const scanFile = useCallback(
    async (file: File) => {
      try {
        await scanDataUrl(withImageType(await readAsDataUrl(file), file.name), false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      }
    },
    [scanDataUrl]
  );
  const scanCapture = useCallback((dataUrl: string) => void scanDataUrl(dataUrl, true), [scanDataUrl]);

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void scanFile(file);
  };

  const busy = phase === 'reading' || phase === 'searching';
  const confident = isConfident(results);
  const openCard = (c: RankedCandidate) =>
    navigate(
      `/katalog/${encodeURIComponent(c.setId)}?karte=${encodeURIComponent(c.cardId)}${reverse ? '&variante=reverse' : ''}`
    );

  return (
    <div className="py-6">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Kartenscanner</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Scanne eine Karte mit der Kamera – am besten mit dem iPhone – oder lege ein Foto ab. Gelesen werden
          Kartennummer, Set und Name; die Bilder bleiben auf deinem Mac.
        </p>

        {available === false && (
          <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
            Der Kartenscanner nutzt die Texterkennung von macOS und steht deshalb nur in der Mac-App zur Verfügung.
          </div>
        )}

        {available && (
          <div role="tablist" aria-label="Art der Aufnahme" className="mt-4 inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
            {(
              [
                ['camera', 'Kamera', VideoCameraIcon],
                ['photo', 'Foto', PhotoIcon],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                disabled={busy}
                onClick={() => setMode(value)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === value
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        )}

        {available && (
          <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
            {mode === 'camera' ? (
              <div>
                <LiveCamera paused={busy} onCapture={scanCapture} />
                <div className="mt-3 min-h-[1.25rem] text-sm" aria-live="polite">
                  {busy ? (
                    <span className="inline-flex items-center text-gray-700 dark:text-gray-200">
                      <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      {phase === 'reading' ? 'Karte wird gelesen …' : 'Katalog wird durchsucht …'}
                    </span>
                  ) : (
                    hint && <span className="text-gray-500 dark:text-gray-400">{hint}</span>
                  )}
                </div>
                {preview && (
                  <img
                    src={preview}
                    alt="Zuletzt gelesene Karte"
                    className="mt-2 h-32 rounded border border-gray-200 object-contain dark:border-gray-700"
                  />
                )}
              </div>
            ) : (
              <div>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Foto einer Karte auswählen oder hier ablegen"
                  onClick={() => !busy && fileInput.current?.click()}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && fileInput.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (!busy) onFiles(e.dataTransfer.files);
                  }}
                  className={`relative flex aspect-[5/7] w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pokemon-blue ${
                    dragging
                      ? 'border-pokemon-blue bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 bg-white hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500'
                  }`}
                >
                  {preview ? (
                    <img src={preview} alt="Gelesene Karte" className="h-full w-full object-contain" />
                  ) : (
                    <div className="p-6 text-gray-500 dark:text-gray-400">
                      <PhotoIcon className="mx-auto h-10 w-10" aria-hidden="true" />
                      <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-200">Foto hier ablegen</p>
                      <p className="mt-1 text-xs">oder klicken zum Auswählen (JPEG, PNG, HEIC)</p>
                    </div>
                  )}
                  {busy && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-medium text-gray-700 dark:bg-gray-900/70 dark:text-gray-200">
                      <ArrowPathIcon className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                      {phase === 'reading' ? 'Karte wird gelesen …' : 'Katalog wird durchsucht …'}
                    </div>
                  )}
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    onFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                {preview && !busy && (
                  <button type="button" onClick={() => fileInput.current?.click()} className={`mt-3 w-full ${secondaryButtonSmallClass}`}>
                    <CameraIcon className="h-4 w-4" aria-hidden="true" /> Nächste Karte
                  </button>
                )}
                {ocr && !ocr.cardDetected && !busy && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Der Kartenrand war nicht zu erkennen; gelesen wurde das ganze Foto. Ein ruhiger, einfarbiger Hintergrund
                    hilft.
                  </p>
                )}
              </div>
            )}

            <div className="min-w-0">
              {phase === 'idle' && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Am zuverlässigsten klappt es bei Karten ab Karmesin &amp; Purpur, die unten links einen Set-Code tragen
                  (z. B. „SVI DE 123/198“). Bei älteren Karten genügen meist Nummer und Name.
                </p>
              )}

              {error && (
                <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
                  {error}
                </div>
              )}

              {(phase === 'done' || phase === 'error') && (
                <>
                  {describeInfo(info).length > 0 && (
                    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Gelesen:</span>
                      {describeInfo(info).map((part) => (
                        <span key={part} className="rounded-md bg-gray-100 px-2 py-0.5 font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-100">
                          {part}
                        </span>
                      ))}
                    </div>
                  )}

                  {results.length > 0 && (
                    <label className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={reverse}
                        onChange={(e) => setReverse(e.target.checked)}
                        className="rounded"
                      />
                      <span className="whitespace-nowrap font-medium">Reverse Holo</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        (erkennt der Scanner nicht – wird beim Übernehmen vorausgewählt)
                      </span>
                    </label>
                  )}

                  {phase === 'done' && results.length === 0 && (
                    <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
                      Keine passende Karte gefunden. Prüfe die gelesenen Angaben unten und suche erneut.
                    </p>
                  )}

                  {results.length > 0 && (
                    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {results.map((c, index) => {
                        const best = index === 0 && confident;
                        return (
                          <li key={c.cardId}>
                            <button
                              type="button"
                              onClick={() => openCard(c)}
                              className={`flex w-full gap-3 rounded-lg border p-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pokemon-blue ${
                                best
                                  ? 'border-green-400 bg-green-50 hover:bg-green-100 dark:border-green-700 dark:bg-green-900/20 dark:hover:bg-green-900/30'
                                  : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/60'
                              }`}
                            >
                              <div className="relative aspect-[5/7] w-20 flex-shrink-0 overflow-hidden rounded bg-gray-100 dark:bg-gray-900">
                                <FallbackImage
                                  sources={catalogCardImageSources('de', c, c.setId, 'low')}
                                  alt={c.name}
                                  loading="lazy"
                                  showLanguageBadge
                                  className="h-full w-full object-contain"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                {best && (
                                  <div className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-300">
                                    <CheckBadgeIcon className="h-4 w-4" aria-hidden="true" /> Sicherer Treffer
                                  </div>
                                )}
                                <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{c.name}</div>
                                <div className="truncate text-xs text-gray-500 dark:text-gray-400">{c.setName}</div>
                                <div className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                                  {c.localId}
                                  {c.official && /^\d+$/.test(c.localId) ? `/${c.official}` : ''}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {c.matches.map((m) => (
                                    <span key={m} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                      {MATCH_LABEL[m]}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <form
                    className="mt-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setError(null);
                      void search(draft);
                    }}
                  >
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Angaben korrigieren</h2>
                    <div className="mt-3 grid gap-3 sm:grid-cols-4">
                      <label className="block">
                        <span className={labelClass}>Set-Code</span>
                        <input
                          className={`mt-1 ${inputClass}`}
                          value={draft.setCode ?? ''}
                          placeholder="z. B. SVI"
                          onChange={(e) => setDraft((d) => ({ ...d, setCode: e.target.value.trim().toUpperCase() || undefined }))}
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Nummer</span>
                        <input
                          className={`mt-1 ${inputClass}`}
                          value={draft.number ?? ''}
                          placeholder="z. B. 123"
                          onChange={(e) => setDraft((d) => ({ ...d, number: e.target.value.trim() || undefined }))}
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Set-Größe</span>
                        <input
                          className={`mt-1 ${inputClass}`}
                          inputMode="numeric"
                          value={draft.total ?? ''}
                          placeholder="z. B. 198"
                          onChange={(e) => {
                            const n = Number.parseInt(e.target.value, 10);
                            setDraft((d) => ({ ...d, total: Number.isFinite(n) ? n : undefined }));
                          }}
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Name</span>
                        <input
                          className={`mt-1 ${inputClass}`}
                          value={draft.name ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value || undefined }))}
                        />
                      </label>
                    </div>
                    <button type="submit" className={`mt-3 ${primaryButtonClass}`} disabled={busy}>
                      Erneut suchen
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Scanner;
