import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { dangerButtonClass, primaryButtonClass, secondaryButtonClass } from '../utils/formStyles';

// Rückmeldungen der App (#131): kurze Meldungen am unteren Rand, auf Wunsch
// mit „Rückgängig“, und ein eigener Bestätigungsdialog anstelle von
// window.confirm/alert.

export type NoticeKind = 'success' | 'error' | 'info';

export interface NoticeOptions {
  kind?: NoticeKind;
  /** Macht die gemeldete Änderung rückgängig; die Meldung bekommt dann einen Knopf dafür. */
  undo?: () => void;
}

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  /** Rote Hauptaktion für Schritte, die sich nicht zurücknehmen lassen. */
  danger?: boolean;
}

interface FeedbackApi {
  notify: (message: string, options?: NoticeOptions) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

/** So lange bleibt eine Meldung stehen; mit „Rückgängig“ länger. */
export const NOTICE_MS = 4000;
export const UNDO_MS = 8000;

// Ohne Provider (einzelne Komponenten im Test) gibt es keine Meldungen, und
// Rückfragen gelten als abgelehnt.
const FeedbackContext = createContext<FeedbackApi>({
  notify: () => undefined,
  confirm: () => Promise.resolve(false),
});

export const useFeedback = (): FeedbackApi => useContext(FeedbackContext);

interface Notice extends NoticeOptions {
  id: number;
  message: string;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (answer: boolean) => void;
}

const KIND_ICON: Record<NoticeKind, React.ElementType> = {
  success: CheckCircleIcon,
  error: ExclamationTriangleIcon,
  info: InformationCircleIcon,
};
const KIND_COLOR: Record<NoticeKind, string> = {
  success: 'text-green-400',
  error: 'text-red-400',
  info: 'text-blue-300',
};

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const nextId = useRef(1);

  const notify = useCallback<FeedbackApi['notify']>((message, options) => {
    setNotice({ id: nextId.current++, message, ...options });
  }, []);

  const confirm = useCallback<FeedbackApi['confirm']>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setPending((current) => {
          // Eine noch offene Rückfrage gilt als abgelehnt.
          current?.resolve(false);
          return { ...options, resolve };
        });
      }),
    []
  );

  const api = useMemo(() => ({ notify, confirm }), [notify, confirm]);

  // Die Meldung verschwindet von selbst. Solange der Zeiger darauf steht, bleibt sie.
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (!notice || hovered) return;
    const timer = window.setTimeout(() => setNotice(null), notice.undo ? UNDO_MS : NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice, hovered]);

  const noticeRef = useRef(notice);
  noticeRef.current = notice;
  const runUndo = useCallback(() => {
    noticeRef.current?.undo?.();
    setNotice(null);
    setHovered(false);
  }, []);

  // Cmd/Strg+Z nimmt die gemeldete Änderung zurück, solange die Meldung steht
  // und nicht gerade in einem Feld getippt wird (dort gehört das Kürzel dem Text).
  const canUndo = Boolean(notice?.undo);
  useEffect(() => {
    if (!canUndo) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== 'z' || isTyping(event.target)) return;
      event.preventDefault();
      runUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canUndo, runUndo]);

  const answer = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  const Icon = notice ? KIND_ICON[notice.kind ?? 'success'] : null;

  return (
    <FeedbackContext.Provider value={api}>
      {children}

      {notice && Icon && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div
            key={notice.id}
            role={notice.kind === 'error' ? 'alert' : 'status'}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-lg bg-gray-900 py-2.5 pl-4 pr-2 text-sm text-white shadow-lg ring-1 ring-white/10 dark:bg-gray-700"
          >
            <Icon className={`h-5 w-5 flex-shrink-0 ${KIND_COLOR[notice.kind ?? 'success']}`} aria-hidden="true" />
            <span className="min-w-0">{notice.message}</span>
            {notice.undo && (
              <button
                type="button"
                onClick={runUndo}
                className="flex-shrink-0 rounded-md px-2 py-1 font-semibold text-pokemon-yellow hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                Rückgängig
              </button>
            )}
            <button
              type="button"
              aria-label="Meldung schließen"
              onClick={() => {
                setNotice(null);
                setHovered(false);
              }}
              className="flex-shrink-0 rounded-md p-1 text-gray-400 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <XMarkIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {pending && <ConfirmDialog options={pending} onAnswer={answer} />}
    </FeedbackContext.Provider>
  );
};

const ConfirmDialog: React.FC<{ options: ConfirmOptions; onAnswer: (value: boolean) => void }> = ({
  options,
  onAnswer,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Bei riskanten Schritten liegt der Fokus auf „Abbrechen“, sonst auf der Hauptaktion.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (options.danger ? cancelRef : confirmRef).current?.focus();
    return () => previous?.focus?.();
  }, [options.danger]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onAnswer(false);
    } else if (event.key === 'Tab') {
      // Fokus bleibt zwischen den beiden Knöpfen.
      event.preventDefault();
      (document.activeElement === cancelRef.current ? confirmRef : cancelRef).current?.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby={options.message ? 'confirm-message' : undefined}
      onKeyDown={onKeyDown}
    >
      <div className="fixed inset-0 bg-gray-900/50" onClick={() => onAnswer(false)} aria-hidden="true" />
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl ring-1 ring-black/10 dark:bg-gray-800 dark:ring-white/10">
        <h2 id="confirm-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {options.title}
        </h2>
        {options.message && (
          <div id="confirm-message" className="mt-2 space-y-2 text-sm text-gray-600 dark:text-gray-300">
            {options.message}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button ref={cancelRef} type="button" onClick={() => onAnswer(false)} className={secondaryButtonClass}>
            Abbrechen
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onAnswer(true)}
            className={options.danger ? dangerButtonClass : primaryButtonClass}
          >
            {options.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};
