<div align="center">

<img src="docs/assets/logo.png" alt="CollectODex" width="128" />

# CollectODex

**Die Desktop-App für deine Pokémon-Kartensammlung.**
Kategorisieren, bewerten, Bestand führen – und sehen, was deine Sammlung wert ist.

🇩🇪 Deutsch · [🇬🇧 English](README.en.md)

[![Release](https://img.shields.io/github/v/release/R0cketBean/collectodex?label=Download&color=3B4CCA)](https://github.com/R0cketBean/collectodex/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/R0cketBean/collectodex/total?color=00C49F)](https://github.com/R0cketBean/collectodex/releases)
[![Build](https://github.com/R0cketBean/collectodex/actions/workflows/build.yml/badge.svg)](https://github.com/R0cketBean/collectodex/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Platform](https://img.shields.io/badge/Plattform-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-555)

[**⬇️ Download**](https://github.com/R0cketBean/collectodex/releases/latest) · [Landingpage](https://r0cketbean.github.io/collectodex/) · [Roadmap](https://github.com/R0cketBean/collectodex/milestones)

</div>

---

<div align="center">
  <img src="docs/screenshots/dashboard-light.png" alt="Dashboard" width="800" />
</div>

## Was ist CollectODex?

CollectODex ist eine lokale Desktop-Anwendung, mit der du deine Pokémon-Sammlung
strukturiert verwaltest – von Sealed-Produkten über gegradete Karten bis zu
Einzelkarten und beliebigen eigenen Kategorien. Alle Daten bleiben auf deinem
Rechner; nichts wird in eine Cloud hochgeladen.

## Funktionen

- 📦 **Flexible Kategorien** – Sealed, Gegradet, Einzelkarten oder eigene Kategorien mit frei definierbaren Attributen.
- 🃏 **Kartenkatalog** – Sets auf Deutsch, Englisch und Japanisch durchblättern, vorhandene Karten abhaken und mit Bild in die Sammlung übernehmen.
- 💶 **Preis-Check** – eigene Werte mit dem Katalogpreis vergleichen und sehen, welche Preise fällig sind.
- 📊 **Dashboard** – Gesamtwert, Gewinn/Verlust, Wertverteilung und Wertentwicklung auf einen Blick.
- 📈 **Statistik** – Rendite je Eintrag, Haltedauer, größte Verluste und Wertverlauf pro Kategorie.
- 🧮 **Berechnete Felder** – Gesamtkosten, Gesamtwert und Gewinn/Verlust per Formel automatisch ermittelt.
- 🖼️ **Fotos & Kachelansicht** – Bilder liegen als Dateien neben der Datendatei, Listen gibt es als Tabelle oder Kacheln.
- 🔎 **Globale Suche** – mit ⌘K bzw. Strg+K über alle Kategorien, dazu Filtern und Sortieren in jeder Liste.
- ↩️ **Rückgängig** – Löschen und Massenbearbeitung lassen sich zurücknehmen.
- 💾 **Import/Export & automatische Backups** – Excel-Export und tägliche Sicherungen in einen Ordner deiner Wahl.
- 🌗 **Dark Mode** – Hell, dunkel oder dem System folgend.
- 🔄 **Auto-Update** – meldet neue Versionen und installiert sie auf Klick.
- 🩺 **Fehlerprotokoll** – bleibt auf deinem Rechner und lässt sich bei Problemen exportieren.

## Screenshots

| Dashboard | Statistik | Sammlung |
| :---: | :---: | :---: |
| [![Dashboard](docs/screenshots/dashboard-light.png)](docs/screenshots/dashboard-light.png) | [![Statistik](docs/screenshots/statistics-light.png)](docs/screenshots/statistics-light.png) | [![Sammlung](docs/screenshots/collection-light.png)](docs/screenshots/collection-light.png) |

<details>
<summary>🌙 Dark Mode</summary>

| Dashboard | Statistik | Sammlung |
| :---: | :---: | :---: |
| [![Dashboard (dunkel)](docs/screenshots/dashboard-dark.png)](docs/screenshots/dashboard-dark.png) | [![Statistik (dunkel)](docs/screenshots/statistics-dark.png)](docs/screenshots/statistics-dark.png) | [![Sammlung (dunkel)](docs/screenshots/collection-dark.png)](docs/screenshots/collection-dark.png) |

</details>

## Download & Installation

Die fertigen Builds gibt es auf der **[Releases-Seite](https://github.com/R0cketBean/collectodex/releases/latest)**.

**macOS** (ab macOS 13, Apple Silicon; signiert & notarisiert)
1. Die `.dmg` öffnen.
2. CollectODex in den Ordner „Programme" ziehen.

**Windows** (ab Windows 10; NSIS-Installer, derzeit unsigniert)
1. Die `…Setup.exe` ausführen.
2. Falls SmartScreen warnt: „Weitere Informationen" → „Trotzdem ausführen".

> 💡 Eine Übersicht mit Direktdownloads findest du auch auf der [Landingpage](https://r0cketbean.github.io/collectodex/).

## Entwicklung

Voraussetzungen: **Node.js 22.12+** und **npm 10+**.

```bash
npm install
npm run electron-dev   # React-Dev-Server + Electron in einem Schritt
```

Optional als reine Web-Version (ohne Electron-Wrapper):

```bash
npm start
```

Tests:

```bash
npm test          # Unit- und Komponententests
npm run smoke     # Starttest gegen die gepackte App unter dist/
```

## Build

```bash
npm run electron-pack       # macOS (DMG + ZIP)
npm run electron-pack-all   # macOS + Windows + Linux
```

Die Artefakte landen unter `dist/`. Signierte Release-Builds erzeugt der
[Release-Workflow](.github/workflows/release.yml) automatisch beim Pushen eines
`v*`-Tags.

> Die Screenshots in diesem README erzeugt `node scripts/generate-screenshots.mjs`
> aus der laufenden Web-Version (`npm start -- --port 5180`); das Skript braucht ein
> installiertes Google Chrome.

## Architektur

| Pfad | Zweck |
| --- | --- |
| `src/types/models.ts` | Datenmodell: Kategorien definieren Attribute, Items speichern Werte je Attribut-ID – dadurch beliebige eigene Kategorien. |
| `src/context/CollectionContext.tsx` | Globaler Sammlungs-State (granulare Slices, stabile Actions). |
| `src/pages/` | Dashboard, Sammlungslisten, Kartenkatalog, Preis-Check, Statistik, Kategorieverwaltung, Import/Export, Einstellungen. |
| `src/services/StorageService.ts` | Persistenz-Abstraktion (Electron-Store ↔ `localStorage`-Fallback). |
| `src/services/tcgdex.ts` | Kartenkatalog und Katalogpreise über die TCGdex-API. |
| `public/electron.js`, `public/preload.js` | Electron-Hauptprozess und Preload. |
| `public/security.js` | Regeln für das Fenster: erlaubte Speicherschlüssel, nur `https:`-Links, keine fremde Navigation. |
| `public/imageStore.js` | Bildablage als Dateien, Vorschaubilder, Aufräumen verwaister Dateien. |
| `public/errorLog.js` | Fehlerprotokoll von Hauptprozess und Fenster. |
| `scripts/smoke-test.mjs` | Starttest der gepackten App (läuft in der CI und vor jedem Release). |

Stack: **React 19 · TypeScript · Tailwind CSS · Vite · Electron · Recharts**.

## Datenspeicherung

Alles liegt lokal im Electron-User-Data-Verzeichnis (macOS:
`~/Library/Application Support/collectodex`):

| Ort | Inhalt |
| --- | --- |
| `collectodex-data.json` | Kategorien, Einträge, Wertverlauf, Katalog-Häkchen und Einstellungen. |
| `images/` | Fotos als einzelne Dateien samt Vorschaubildern. Verwaiste Dateien räumst du in den Einstellungen auf. |
| `logs/collectodex.log` | Fehlerprotokoll; wird nie übertragen. |

Ins Netz geht die App nur für den Kartenkatalog (TCGdex), Katalogbilder
(TCGdex, pokemontcg.io) und die Update-Prüfung (GitHub). Im Browser dient
`localStorage` als Fallback.

## Roadmap

Die Planung läuft über [GitHub-Milestones](https://github.com/R0cketBean/collectodex/milestones).
Der Milestone „v1.0 – Stabilität & Release“ ist bis auf die Signatur des
Windows-Installers abgeschlossen; was danach kommt, steht unter „Nach 1.0“.

## Lizenz

[MIT](LICENSE) © Andreas Bröder
