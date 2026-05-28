# CollectODex

Desktop-Anwendung zur Verwaltung einer Pokémon-Kartensammlung. Kategorisierung, Bewertung und Bestandsführung für Sealed-Produkte, gegradete Karten, Einzelkarten und beliebige eigene Kategorien.

Gebaut mit React 19, TypeScript, Tailwind CSS und Electron. Daten werden lokal persistiert (Electron-Store, mit `localStorage`-Fallback im Browser).

## Voraussetzungen

- Node.js 18+
- npm 9+
- macOS, Windows oder Linux

## Erste Schritte

```bash
npm install
npm run electron-dev
```

Damit startet der React-Dev-Server und Electron in einem Schritt.

Optional kann die Web-Version ohne Electron-Wrapper gestartet werden:

```bash
npm start
```

## Build

```bash
npm run electron-pack          # macOS (DMG + ZIP)
npm run electron-pack-all      # macOS + Windows + Linux
```

Die Artefakte landen unter `dist/`.

## Architektur

- **`src/types/models.ts`** — Datenmodell. Kategorien definieren Attribute, Items speichern Werte unter Attribut-IDs. Dadurch sind beliebige eigene Kategorien möglich.
- **`src/context/CollectionContext.tsx`** — Globaler Sammlungs-State (Kategorien, Items, abgeleitete Statistiken).
- **`src/services/StorageService.ts`** — Persistenz-Abstraktion (Electron-Store ↔ localStorage).
- **`src/services/PriceService.ts`** — Anbindung an den Preis-Backend-Server.
- **`src/pages/`** — Dashboard, CategoryItemsList, CategoryManagement, ImportExport.
- **`public/electron.js`**, **`public/preload.js`** — Electron-Hauptprozess und Preload.
- **`server/`** — Optionaler Node-Server, der Cardmarket-Preise via Puppeteer scrapt. *Wird in einer kommenden Version durch die offizielle Cardmarket-OAuth-API ersetzt.*

## Datenspeicherung

Sammlungs- und Kategoriedaten werden im Electron-User-Data-Verzeichnis abgelegt (Schlüssel: `pokemon_collection_categories`, `pokemon_collection_items`).

## Status

Frühe Entwicklungsversion. Roadmap:

1. **Phase 1 (jetzt):** Repository sauber aufgesetzt, GitHub-Anbindung, .gitignore, README.
2. **Phase 2:** Migration von Create React App auf Vite, Aufspaltung der großen Komponenten, Tests.
3. **Phase 3:** Cardmarket-OAuth-API, Auto-Update via electron-updater, iCloud-Backup, weitere Features.

## Lizenz

MIT — siehe `package.json`.
