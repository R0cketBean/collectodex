// @vitest-environment node
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Das Modul gehört zum Hauptprozess (CommonJS in public/), hat aber keine
// Electron-Abhängigkeit und lässt sich deshalb direkt testen.
const require = createRequire(import.meta.url);
const { createErrorLog, MAX_ENTRY_CHARS } = require('../../public/errorLog.js');

let tmp: string;
let dir: string;
let clock: number;
const now = () => new Date(clock);

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdx-log-'));
  dir = path.join(tmp, 'logs');
  clock = Date.UTC(2026, 10, 12, 20, 0, 0);
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const lines = (text: string) => text.split('\n').filter(Boolean);

describe('createErrorLog', () => {
  it('legt Ordner und Datei beim ersten Eintrag an', () => {
    const log = createErrorLog({ dir, now });
    expect(log.info()).toEqual({ bytes: 0, updatedAt: null, exists: false });

    log.write('main', 'error', 'Speichern fehlgeschlagen:', 42);

    expect(log.read()).toBe('2026-11-12T20:00:00.000Z [main] ERROR Speichern fehlgeschlagen: 42\n');
    const info = log.info();
    expect(info.exists).toBe(true);
    expect(info.bytes).toBeGreaterThan(0);
    expect(info.updatedAt).not.toBeNull();
  });

  it('kennzeichnet Quelle und Stufe', () => {
    const log = createErrorLog({ dir, now });
    log.write('fenster', 'warn', 'Achtung');
    log.write('irgendwas', 'unbekannt', 'x');
    expect(lines(log.read())).toEqual([
      '2026-11-12T20:00:00.000Z [fenster] WARN Achtung',
      '2026-11-12T20:00:00.000Z [main] ERROR x',
    ]);
  });

  it('schreibt bei Fehlern den Stack und bei Objekten JSON', () => {
    const log = createErrorLog({ dir, now });
    log.write('main', 'error', 'Kaputt:', new TypeError('nicht lesbar'), { code: 7 }, undefined);
    const text = log.read();
    expect(text).toContain('TypeError: nicht lesbar');
    expect(text).toContain('errorLog.test');
    expect(text).toContain('{"code":7} undefined');
  });

  it('ersetzt den Benutzerordner durch ~', () => {
    const log = createErrorLog({ dir, now, home: '/Users/misty' });
    log.write('main', 'error', 'ENOENT /Users/misty/Library/x.json und /Users/misty/Desktop');
    expect(log.read()).toContain('ENOENT ~/Library/x.json und ~/Desktop');
    expect(log.read()).not.toContain('misty');
  });

  it('kürzt überlange Einträge', () => {
    const log = createErrorLog({ dir, now });
    log.write('fenster', 'error', 'x'.repeat(MAX_ENTRY_CHARS * 2));
    expect(lines(log.read())[0].length).toBeLessThan(MAX_ENTRY_CHARS + 60);
  });

  it('schiebt eine volle Datei einmal weg und liest beide in der richtigen Reihenfolge', () => {
    const log = createErrorLog({ dir, now, maxBytes: 120 });
    log.write('main', 'error', 'erster ' + 'a'.repeat(100));
    log.write('main', 'error', 'zweiter');
    log.write('main', 'error', 'dritter');

    expect(fs.existsSync(`${log.file}.1`)).toBe(true);
    expect(fs.readFileSync(log.file, 'utf8')).not.toContain('erster');
    expect(lines(log.read()).map((l) => l.split(' ERROR ')[1].slice(0, 7))).toEqual(['erster ', 'zweiter', 'dritter']);
  });

  it('bremst eine Flut von Meldungen und meldet das einmal', () => {
    const log = createErrorLog({ dir, now, maxPerMinute: 3 });
    for (let i = 0; i < 10; i++) log.write('fenster', 'error', `Meldung ${i}`);
    const first = lines(log.read());
    expect(first).toHaveLength(4);
    expect(first[3]).toContain('Zu viele Meldungen');

    clock += 61_000;
    log.write('fenster', 'error', 'wieder da');
    expect(lines(log.read()).at(-1)).toContain('wieder da');
  });

  it('stört nicht, wenn sich nichts schreiben lässt', () => {
    fs.writeFileSync(path.join(tmp, 'belegt'), 'x');
    const log = createErrorLog({ dir: path.join(tmp, 'belegt', 'logs'), now });
    expect(() => log.write('main', 'error', 'x')).not.toThrow();
    expect(log.read()).toBe('');
  });

  it('baut einen Export mit Angaben zur Umgebung', () => {
    const log = createErrorLog({ dir, now });
    expect(log.buildExport({ Version: '1.0.0' })).toContain('(keine Einträge)');

    log.write('main', 'error', 'Fehler A');
    const text = log.buildExport({ Version: '1.0.0', System: 'darwin 27 arm64' });
    expect(text.startsWith('CollectODex – Fehlerprotokoll\nErstellt: 2026-11-12T20:00:00.000Z\nVersion: 1.0.0\nSystem: darwin 27 arm64\n')).toBe(true);
    expect(text).toContain('[main] ERROR Fehler A');
  });
});
