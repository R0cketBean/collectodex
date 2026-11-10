// Prüft Bildadressen durch Laden. Nötig, weil die Katalog-Bildquellen nicht
// verraten, ob es ein Bild wirklich gibt – erst der Versuch zeigt es.

import type { ImageSource } from '../services/tcgdex';

const loads = (url: string): Promise<boolean> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = url;
  });

/** Erste Quelle, die sich laden lässt; `undefined`, wenn keine. */
export const firstLoadableImage = async (sources: ImageSource[]): Promise<string | undefined> => {
  for (const source of sources) {
    if (await loads(source.url)) return source.url;
  }
  return undefined;
};
