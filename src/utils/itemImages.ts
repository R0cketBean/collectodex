// Bild-Slots eines Sammlungseintrags (#1: mehrere Bilder pro Eintrag).
//
// Bilder werden weiterhin in `CollectionItem.images` als { [key]: dataUrl }
// gehalten. Statt nur eines Bildes ('image') gibt es jetzt benannte Slots für
// Vorder-/Rückseite plus beliebig viele Extra-Fotos (z.B. Ecken/Grading-Label):
// - FRONT_IMAGE_KEY  = 'image'      (bleibt für Abwärtskompatibilität bestehen;
//                                    vorhandene Einzelbilder werden so automatisch
//                                    zur Vorderseite)
// - BACK_IMAGE_KEY   = 'imageBack'
// - Extras           = 'imageExtra_<uuid>'
//
// Die UI sortiert/benennt Bilder ausschließlich über getOrderedImages, damit
// Tabelle, Lightbox und Bearbeiten-Dialog dieselbe Reihenfolge/Beschriftung
// sehen.

export const FRONT_IMAGE_KEY = 'image';
export const BACK_IMAGE_KEY = 'imageBack';
export const EXTRA_IMAGE_PREFIX = 'imageExtra_';

export interface ItemImage {
  /** Schlüssel in CollectionItem.images (für add/remove). */
  key: string;
  /** Anzeige-Label, z.B. "Vorderseite", "Rückseite", "Foto 1". */
  label: string;
  /** Base64-Data-URL oder URL. */
  data: string;
}

/** Erzeugt einen eindeutigen Schlüssel für ein zusätzliches Foto. */
export const createExtraImageKey = (): string =>
  `${EXTRA_IMAGE_PREFIX}${
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  }`;

/**
 * Liefert alle vorhandenen Bilder in stabiler Anzeigereihenfolge
 * (Vorderseite → Rückseite → Extras) mit passendem Label. Leere/fehlende
 * Slots werden übersprungen. Unbekannte Alt-Schlüssel werden als Extras
 * behandelt, damit kein Bild verloren geht.
 */
export const getOrderedImages = (
  images?: Record<string, string>
): ItemImage[] => {
  if (!images) return [];

  const result: ItemImage[] = [];

  if (images[FRONT_IMAGE_KEY]) {
    result.push({ key: FRONT_IMAGE_KEY, label: 'Vorderseite', data: images[FRONT_IMAGE_KEY] });
  }
  if (images[BACK_IMAGE_KEY]) {
    result.push({ key: BACK_IMAGE_KEY, label: 'Rückseite', data: images[BACK_IMAGE_KEY] });
  }

  Object.keys(images)
    .filter(key => key !== FRONT_IMAGE_KEY && key !== BACK_IMAGE_KEY)
    .filter(key => Boolean(images[key]))
    .forEach((key, index) => {
      result.push({ key, label: `Foto ${index + 1}`, data: images[key] });
    });

  return result;
};

/** Das primär anzuzeigende Bild (Vorderseite, sonst das erste vorhandene). */
export const getPrimaryImage = (
  images?: Record<string, string>
): string | null => {
  const ordered = getOrderedImages(images);
  return ordered.length > 0 ? ordered[0].data : null;
};

/** Anzahl vorhandener Bilder. */
export const countImages = (images?: Record<string, string>): number =>
  getOrderedImages(images).length;
