<div align="center">

<img src="docs/assets/logo.png" alt="CollectODex" width="128" />

# CollectODex

**The desktop app for your Pokémon card collection.**
Categorise, value and track your inventory – and see what your collection is worth.

[🇩🇪 Deutsch](README.md) · 🇬🇧 English

[![Release](https://img.shields.io/github/v/release/R0cketBean/collectodex?label=Download&color=3B4CCA)](https://github.com/R0cketBean/collectodex/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/R0cketBean/collectodex/total?color=00C49F)](https://github.com/R0cketBean/collectodex/releases)
[![Build](https://github.com/R0cketBean/collectodex/actions/workflows/build.yml/badge.svg)](https://github.com/R0cketBean/collectodex/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Platform](https://img.shields.io/badge/Platform-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-555)

[**⬇️ Download**](https://github.com/R0cketBean/collectodex/releases/latest) · [Landing page](https://r0cketbean.github.io/collectodex/) · [Roadmap](https://github.com/R0cketBean/collectodex/milestones)

</div>

---

<div align="center">
  <img src="docs/screenshots/dashboard-light.png" alt="Dashboard" width="800" />
</div>

## What is CollectODex?

CollectODex is a local desktop app for managing your Pokémon collection in a
structured way – from sealed product and graded cards to singles and any custom
categories you like. All data stays on your machine; nothing is uploaded to a
cloud.

## Features

- 📦 **Flexible categories** – sealed, graded, singles, or your own categories with freely defined attributes.
- 📊 **Dashboard** – total value, profit/loss, value distribution and value trend at a glance.
- 📈 **Statistics** – ROI per item, average holding period and value history per category.
- 🧮 **Calculated fields** – total cost, total value and profit/loss derived automatically via formulas.
- 🌗 **Dark mode** – light, dark, or follow the system.
- 🔎 **Search, filter & sort** – even in a narrow window.
- 💾 **Import/export & automatic backups** – Excel export and restorable backups.
- 🔄 **Auto-update** – notifies you about new versions (electron-updater).

## Screenshots

| Dashboard | Statistics | Collection |
| :---: | :---: | :---: |
| [![Dashboard](docs/screenshots/dashboard-light.png)](docs/screenshots/dashboard-light.png) | [![Statistics](docs/screenshots/statistics-light.png)](docs/screenshots/statistics-light.png) | [![Collection](docs/screenshots/collection-light.png)](docs/screenshots/collection-light.png) |

<details>
<summary>🌙 Dark mode</summary>

| Dashboard | Statistics | Collection |
| :---: | :---: | :---: |
| [![Dashboard (dark)](docs/screenshots/dashboard-dark.png)](docs/screenshots/dashboard-dark.png) | [![Statistics (dark)](docs/screenshots/statistics-dark.png)](docs/screenshots/statistics-dark.png) | [![Collection (dark)](docs/screenshots/collection-dark.png)](docs/screenshots/collection-dark.png) |

</details>

## Download & install

Prebuilt binaries are on the **[Releases page](https://github.com/R0cketBean/collectodex/releases/latest)**.

**macOS** (signed & notarised)
1. Open the `.dmg`.
2. Drag CollectODex into your **Applications** folder.

**Windows** (NSIS installer, currently unsigned)
1. Run the `…Setup.exe`.
2. If SmartScreen warns: “More info” → “Run anyway”.

> 💡 You can also find direct downloads on the [landing page](https://r0cketbean.github.io/collectodex/).

## Development

Requirements: **Node.js 18+** and **npm 9+**.

```bash
npm install
npm run electron-dev   # React dev server + Electron in one step
```

Optionally as a plain web build (without the Electron wrapper):

```bash
npm start
```

Tests:

```bash
npm test
```

## Build

```bash
npm run electron-pack       # macOS (DMG + ZIP)
npm run electron-pack-all   # macOS + Windows + Linux
```

Artifacts land in `dist/`. Signed release builds are produced automatically by
the [release workflow](.github/workflows/release.yml) when a `v*` tag is pushed.

> The screenshots in this README are reproducibly generated from the running web
> build (`npm start`) with `node scripts/generate-screenshots.mjs`.

## Architecture

| Path | Purpose |
| --- | --- |
| `src/types/models.ts` | Data model: categories define attributes, items store values per attribute ID – enabling arbitrary custom categories. |
| `src/context/CollectionContext.tsx` | Global collection state (granular slices, stable actions). |
| `src/pages/` | Dashboard, collection lists, category management, statistics, import/export, settings. |
| `src/services/StorageService.ts` | Persistence abstraction (Electron store ↔ `localStorage` fallback). |
| `public/electron.js`, `public/preload.js` | Electron main process and preload. |

Stack: **React 19 · TypeScript · Tailwind CSS · Vite · Electron · Recharts**.

## Data storage

Collection and category data live in the Electron user-data directory (keys
`pokemon_collection_categories`, `pokemon_collection_items`,
`pokemon_collection_value_history`). In the browser, `localStorage` is used as a
fallback.

## Roadmap

Planning happens via [GitHub milestones](https://github.com/R0cketBean/collectodex/milestones).
Current focus: consolidation & performance, the official Cardmarket OAuth API for
prices, design polish – Windows polish last.

## License

[MIT](LICENSE) © Andreas Bröder
