// Erzeugt die Screenshots für README und GitHub-Pages-Landingpage.
//
// Voraussetzung: der Dev-Server läuft (npm start, Port aus DEV_URL, Default
// http://localhost:5180). Das Skript seedet einen realistischen Demo-Bestand
// in localStorage, rendert die Hauptseiten in Hell- und Dunkelmodus und legt
// die PNGs unter docs/screenshots/ ab.
//
//   npm start                       # Terminal 1 (Dev-Server)
//   node scripts/generate-screenshots.mjs   # Terminal 2
//
// Puppeteer wird aus server/node_modules verwendet (dort bereits installiert).

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const require = createRequire(join(repoRoot, 'server', 'index.js'));
const puppeteer = require('puppeteer');

const DEV_URL = process.env.DEV_URL || 'http://localhost:5180';
const OUT_DIR = join(repoRoot, 'docs', 'screenshots');
mkdirSync(OUT_DIR, { recursive: true });

const iso = (d) => new Date(d + 'T10:00:00Z').toISOString();
const mk = (id, categoryId, values, addedDate) => ({
  id: 'demo_' + id,
  categoryId,
  values: { ...values, addedDate },
  createdAt: iso(addedDate),
  updatedAt: iso(addedDate),
});

const items = [
  mk('s1', 'sealed', { name: 'Karmesin & Purpur – 151 Display', quantity: 1, purchasePrice: 199, currentValue: 320, category: 'Display', language: 'deutsch' }, '2026-01-15'),
  mk('s2', 'sealed', { name: 'Obsidian Flammen ETB', quantity: 2, purchasePrice: 49.9, currentValue: 65, category: 'Elite Trainer Box', language: 'deutsch' }, '2026-02-10'),
  mk('s3', 'sealed', { name: 'Paldea Evolved Booster Bundle', quantity: 3, purchasePrice: 24.9, currentValue: 22, category: 'Bundle Box', language: 'englisch' }, '2026-03-05'),
  mk('s4', 'sealed', { name: 'Crown Zenith ETB', quantity: 1, purchasePrice: 59.9, currentValue: 110, category: 'Elite Trainer Box', language: 'englisch' }, '2025-11-20'),
  mk('g1', 'graded', { name: 'Glurak ex 199/165', quantity: 1, purchasePrice: 280, currentValue: 450, expansion: '151', condition: 'Gem Mint', grade: '10', gradingService: 'PSA', language: 'deutsch' }, '2025-12-01'),
  mk('g2', 'graded', { name: 'Pikachu VMAX 188/185', quantity: 1, purchasePrice: 120, currentValue: 95, expansion: 'Vivid Voltage', condition: 'Mint', grade: '9.5', gradingService: 'CGC', language: 'englisch' }, '2026-02-20'),
  mk('g3', 'graded', { name: 'Mewtu V Alt Art', quantity: 1, purchasePrice: 90, currentValue: 160, expansion: 'Pokémon GO', condition: 'Gem Mint', grade: '10', gradingService: 'PSA', language: 'deutsch' }, '2026-03-12'),
  mk('c1', 'singles', { name: 'Glurak ex 199/165', quantity: 1, purchasePrice: 25, currentValue: 45, expansion: '151', condition: 'Near Mint', language: 'deutsch' }, '2026-01-20'),
  mk('c2', 'singles', { name: 'Miraidon ex', quantity: 2, purchasePrice: 8, currentValue: 6.5, expansion: 'Karmesin & Purpur', condition: 'Mint', language: 'deutsch' }, '2026-02-28'),
  mk('c3', 'singles', { name: 'Lugia V Alt Art', quantity: 1, purchasePrice: 60, currentValue: 85, expansion: 'Silbersturm', condition: 'Near Mint', language: 'englisch' }, '2025-10-15'),
  mk('c4', 'singles', { name: 'Gardevoir ex', quantity: 4, purchasePrice: 4, currentValue: 12, expansion: 'Obsidian Flammen', condition: 'Mint', language: 'deutsch' }, '2026-03-20'),
];

const ends = { sealed: { v: 626, c: 433.4 }, graded: { v: 705, c: 490 }, singles: { v: 191, c: 117 } };
const starts = { sealed: { v: 110, c: 60 }, graded: { v: 0, c: 0 }, singles: { v: 85, c: 60 } };
const histDates = ['2025-10-15', '2025-11-20', '2025-12-15', '2026-01-20', '2026-02-15', '2026-03-20', '2026-04-20', '2026-05-25'];
const lerp = (a, b, t) => +(a + (b - a) * t).toFixed(2);
const history = histDates.map((date, i) => {
  const t = i / (histDates.length - 1);
  const cats = {};
  let tv = 0, tc = 0;
  for (const k of Object.keys(ends)) {
    const v = lerp(starts[k].v, ends[k].v, t);
    const c = lerp(starts[k].c, ends[k].c, t);
    cats[k] = { value: v, cost: c };
    tv += v; tc += c;
  }
  return { date, totalValue: +tv.toFixed(2), totalCost: +tc.toFixed(2), categories: cats };
});

// In-App-Navigation per Klick auf die Sidebar-Links (Client-seitiges Routing
// von react-router; ein hartes goto auf /statistics rendert sonst wieder die
// Startseite). linkText muss exakt dem Navigationslabel entsprechen.
const shots = [
  { name: 'dashboard', linkText: 'Dashboard' },
  { name: 'statistics', linkText: 'Statistik' },
  { name: 'collection', linkText: 'Gegradete Karten' },
];

const run = async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 1000, deviceScaleFactor: 2 });

  // Vor dem ersten Render seeden: zuerst neutrale Seite laden, damit
  // localStorage für den Origin existiert.
  await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((data) => {
      // Vorhandene Test-Kategorien auf die drei Defaults reduzieren bleibt der
      // App überlassen; hier setzen wir Items + Historie + Theme.
      localStorage.setItem('pokemon_collection_items', JSON.stringify(data.items));
      localStorage.setItem('pokemon_collection_value_history', JSON.stringify(data.history));
      localStorage.setItem('collectodex-theme', data.theme);
    }, { items, history, theme });

    // Theme nach dem Setzen einmal frisch laden, damit es greift.
    await page.goto(DEV_URL, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 600));

    for (const shot of shots) {
      // Sidebar-Link mit passendem Text anklicken (Client-seitige Navigation).
      const clicked = await page.evaluate((text) => {
        const link = [...document.querySelectorAll('a')].find(
          (a) => a.textContent.trim() === text
        );
        if (link) { link.click(); return true; }
        return false;
      }, shot.linkText);
      if (!clicked) throw new Error(`Nav-Link "${shot.linkText}" nicht gefunden`);
      // Charts (recharts, lazy) Zeit zum Rendern geben.
      await new Promise((r) => setTimeout(r, 1500));
      const file = join(OUT_DIR, `${shot.name}-${theme}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log('✓', file);
    }
  }

  await browser.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
