/// <reference types="vite/client" />

// pdf.js liefert für das Worker-Modul keine Typen; es wird nur geladen, nicht aufgerufen.
declare module 'pdfjs-dist/build/pdf.worker.mjs';
