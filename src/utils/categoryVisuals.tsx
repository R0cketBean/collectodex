// Zentrale Quelle für die visuelle Darstellung einer Kategorie:
// Icon-Komponente (nach Icon-Name) und Hintergrundfarbe (nach order).
//
// Vorher war diese Zuordnung im Dashboard dupliziert; #52 braucht sie
// zusätzlich in der Kategorie-Bearbeitung (Icon + Farbe als Vorschau).
// Eine gemeinsame Quelle verhindert, dass die Darstellungen auseinander-
// laufen.

import React from 'react';
import {
  SquaresPlusIcon,
  ArchiveBoxIcon as ArchiveBoxOutlineIcon,
  StarIcon,
  CubeIcon,
  DocumentIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import {
  ChartBarIcon,
  CurrencyEuroIcon,
  ArchiveBoxIcon,
} from '@heroicons/react/24/solid';

export const ICON_MAP: Record<string, React.ElementType> = {
  collection: SquaresPlusIcon,
  archive: ArchiveBoxOutlineIcon,
  star: StarIcon,
  cube: CubeIcon,
  photograph: PhotoIcon,
  document: DocumentIcon,
  currency: CurrencyEuroIcon,
  trending: ChartBarIcon,
  items: ArchiveBoxIcon,
};

// Auswahl-Optionen für das Icon-Dropdown (Wert + deutsches Label).
export const ICON_OPTIONS: { value: string; label: string }[] = [
  { value: 'collection', label: 'Sammlung' },
  { value: 'archive', label: 'Archiv' },
  { value: 'star', label: 'Stern' },
  { value: 'cube', label: 'Würfel' },
  { value: 'document', label: 'Dokument' },
  { value: 'photograph', label: 'Foto' },
];

// Hintergrundfarben (Tailwind-Klassen) — nach category.order rotierend,
// identisch zur Dashboard-Darstellung.
export const CATEGORY_COLOR_CLASSES = [
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-red-500',
  'bg-purple-500',
  'bg-pink-500',
];

/** Liefert die Farb-Klasse für eine Kategorie anhand ihrer order. */
export const colorClassForOrder = (order: number): string =>
  CATEGORY_COLOR_CLASSES[
    ((order % CATEGORY_COLOR_CLASSES.length) + CATEGORY_COLOR_CLASSES.length) %
      CATEGORY_COLOR_CLASSES.length
  ];

/** Rendert das Icon zu einem Icon-Namen (Fallback: Sammlung-Icon). */
export const renderCategoryIcon = (
  iconName?: string,
  className = 'h-6 w-6 text-white'
): React.ReactElement => {
  const IconComponent = (iconName && ICON_MAP[iconName]) || SquaresPlusIcon;
  return <IconComponent className={className} aria-hidden="true" />;
};
