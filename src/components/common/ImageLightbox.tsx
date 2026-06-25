// Zoombarer Bild-Lightbox (#1).
//
// Nahezu bildschirmfüllende Vollbild-Ansicht für die Bilder eines Eintrags.
// - Zoom per Mausrad/Trackpad-Pinch (ankert am Cursor) sowie per +/−-Buttons
// - Verschieben (Pan) per Ziehen, sobald hineingezoomt wurde
// - Doppelklick wechselt zwischen "eingepasst" und 2,5×
// - Bei mehreren Bildern: Vor/Zurück, Thumbnails und Tastatur (←/→)
// - Schließen per ✕, Klick auf den Hintergrund oder Esc
//
// Bewusst eigenständig (nur die übergebenen Bilder), damit Tabelle, mobile
// Liste und der Bearbeiten-Dialog denselben Viewer nutzen können.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  XMarkIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowsPointingOutIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { ItemImage } from '../../utils/itemImages';

interface ImageLightboxProps {
  images: ItemImage[];
  initialIndex?: number;
  onClose: () => void;
}

interface View {
  scale: number;
  tx: number;
  ty: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const RESET_VIEW: View = { scale: 1, tx: 0, ty: 0 };

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const ImageLightbox: React.FC<ImageLightboxProps> = ({
  images,
  initialIndex = 0,
  onClose,
}) => {
  const [index, setIndex] = useState(() =>
    clamp(initialIndex, 0, Math.max(0, images.length - 1))
  );
  const [view, setView] = useState<View>(RESET_VIEW);

  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseTx: number;
    baseTy: number;
  } | null>(null);

  const current = images[index];

  const resetView = useCallback(() => setView(RESET_VIEW), []);

  const goTo = useCallback(
    (next: number) => {
      if (images.length === 0) return;
      const wrapped = (next + images.length) % images.length;
      setIndex(wrapped);
      resetView();
    },
    [images.length, resetView]
  );

  // Zoom um einen Bildschirmpunkt (Cursor) herum. Translate (tx/ty) ist in
  // Bildschirm-px; mit transform-origin: center gilt für einen Punkt P:
  //   P = C + t + s·(P0 − C)   →   t' = w − (s'/s)·(w − t),  w = P − C.
  const zoomAround = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      setView(prev => {
        const nextScale = clamp(prev.scale * factor, MIN_SCALE, MAX_SCALE);
        if (nextScale <= MIN_SCALE) return RESET_VIEW;
        const wx = clientX - cx;
        const wy = clientY - cy;
        const ratio = nextScale / prev.scale;
        return {
          scale: nextScale,
          tx: wx - ratio * (wx - prev.tx),
          ty: wy - ratio * (wy - prev.ty),
        };
      });
    },
    []
  );

  // Mausrad-Zoom. Nativer, nicht-passiver Listener, damit das Seiten-Scrollen
  // zuverlässig unterdrückt werden kann.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAround(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [zoomAround]);

  // Tastatursteuerung + Body-Scroll sperren, solange offen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goTo(index - 1);
      else if (e.key === 'ArrowRight') goTo(index + 1);
      else if (e.key === '+' || e.key === '=') zoomAround(window.innerWidth / 2, window.innerHeight / 2, 1.25);
      else if (e.key === '-') zoomAround(window.innerWidth / 2, window.innerHeight / 2, 0.8);
      else if (e.key === '0') resetView();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [index, goTo, onClose, resetView, zoomAround]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (view.scale <= MIN_SCALE) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseTx: view.tx,
      baseTy: view.ty,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setView(prev => ({
      ...prev,
      tx: drag.baseTx + (e.clientX - drag.startX),
      ty: drag.baseTy + (e.clientY - drag.startY),
    }));
  };

  const endPointer = (e: React.PointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (view.scale > MIN_SCALE) resetView();
    else zoomAround(e.clientX, e.clientY, 2.5);
  };

  if (!current) return null;

  const zoomed = view.scale > MIN_SCALE;
  const multiple = images.length > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label="Bildansicht"
    >
      {/* Kopfzeile: Label/Position + Werkzeuge */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-white">
        <span className="text-sm font-medium truncate">
          {current.label}
          {multiple && (
            <span className="ml-2 text-white/60">
              {index + 1}/{images.length}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomAround(window.innerWidth / 2, window.innerHeight / 2, 0.8)}
            className="p-2 rounded-md hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40"
            title="Verkleinern"
            aria-label="Verkleinern"
          >
            <MagnifyingGlassMinusIcon className="h-5 w-5" />
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-white/70">
            {Math.round(view.scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zoomAround(window.innerWidth / 2, window.innerHeight / 2, 1.25)}
            className="p-2 rounded-md hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40"
            title="Vergrößern"
            aria-label="Vergrößern"
          >
            <MagnifyingGlassPlusIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={resetView}
            disabled={!zoomed}
            className="p-2 rounded-md hover:bg-white/10 disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-white/40"
            title="Zurücksetzen"
            aria-label="Zoom zurücksetzen"
          >
            <ArrowsPointingOutIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40"
            title="Schließen"
            aria-label="Schließen"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Bühne */}
      <div
        ref={stageRef}
        className="relative flex-1 flex items-center justify-center overflow-hidden"
        onClick={(e) => {
          // Klick auf den freien Hintergrund schließt (nicht aufs Bild/Buttons).
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {multiple && (
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            className="absolute left-2 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white/40"
            title="Vorheriges Bild"
            aria-label="Vorheriges Bild"
          >
            <ChevronLeftIcon className="h-7 w-7" />
          </button>
        )}

        <img
          src={current.data}
          alt={current.label}
          draggable={false}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onDoubleClick={onDoubleClick}
          className="max-h-full max-w-full object-contain select-none touch-none"
          style={{
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            transformOrigin: 'center',
            cursor: zoomed ? (dragRef.current ? 'grabbing' : 'grab') : 'zoom-in',
            transition: dragRef.current ? 'none' : 'transform 0.1s ease-out',
          }}
        />

        {multiple && (
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            className="absolute right-2 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white/40"
            title="Nächstes Bild"
            aria-label="Nächstes Bild"
          >
            <ChevronRightIcon className="h-7 w-7" />
          </button>
        )}
      </div>

      {/* Thumbnail-Leiste bei mehreren Bildern */}
      {multiple && (
        <div className="flex items-center justify-center gap-2 px-4 py-3 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={img.key}
              type="button"
              onClick={() => goTo(i)}
              title={img.label}
              aria-label={img.label}
              aria-current={i === index}
              className={`h-14 w-14 flex-shrink-0 rounded-md overflow-hidden border-2 transition-colors ${
                i === index
                  ? 'border-pokemon-blue'
                  : 'border-white/20 hover:border-white/50'
              }`}
            >
              <img
                src={img.data}
                alt={img.label}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ImageLightbox;
