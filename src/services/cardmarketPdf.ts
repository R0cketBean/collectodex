// Holt die Textstücke mit Position aus einer PDF (pdf.js).
//
// pdf.js läuft hier ohne eigenen Web-Worker: Die Content-Security-Policy der
// App erlaubt Skripte nur aus dem Paket, und Bestell-PDFs sind klein. Das
// Worker-Modul wird dafür direkt geladen und über `globalThis.pdfjsWorker`
// bereitgestellt; pdf.js nutzt es dann im selben Thread. Beides wird erst beim
// ersten Import geladen, damit der Start der App nicht leidet.

import type { PdfTextItem } from './cardmarketOrder';

let ready: Promise<typeof import('pdfjs-dist')> | null = null;

const loadPdfJs = () => {
  ready ??= (async () => {
    const worker = await import('pdfjs-dist/build/pdf.worker.mjs');
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    return import('pdfjs-dist');
  })();
  return ready;
};

export async function extractPdfText(data: ArrayBuffer): Promise<PdfTextItem[]> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await task.promise;
  try {
    const items: PdfTextItem[] = [];
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await (await doc.getPage(page)).getTextContent();
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        items.push({ page, x: item.transform[4], y: item.transform[5], str: item.str });
      }
    }
    return items;
  } finally {
    void task.destroy();
  }
}
