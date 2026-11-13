import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatLogMessage, installErrorReporting } from './errorReporting';
import type { ElectronAPI } from '../types/electron';

describe('formatLogMessage', () => {
  it('fügt Texte, Objekte und Fehler zu einer Zeile zusammen', () => {
    const text = formatLogMessage(['Speichern:', { key: 'items' }, new RangeError('zu groß'), undefined]);
    expect(text).toContain('Speichern: {"key":"items"} RangeError: zu groß');
    expect(text.endsWith(' undefined')).toBe(true);
  });

  it('kommt mit Werten zurecht, die sich nicht als JSON schreiben lassen', () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(formatLogMessage([loop])).toBe('[object Object]');
  });

  it('kürzt überlange Meldungen', () => {
    expect(formatLogMessage(['x'.repeat(20000)]).length).toBe(8000);
  });
});

describe('installErrorReporting', () => {
  let logError: ReturnType<typeof vi.fn>;
  let consoleError: ReturnType<typeof vi.fn>;
  let consoleWarn: ReturnType<typeof vi.fn>;
  let restoreConsole: () => void;
  let uninstall: () => void = () => undefined;

  beforeEach(() => {
    logError = vi.fn();
    consoleError = vi.fn();
    consoleWarn = vi.fn();
    const original = { error: console.error, warn: console.warn };
    console.error = consoleError as unknown as typeof console.error;
    console.warn = consoleWarn as unknown as typeof console.warn;
    restoreConsole = () => Object.assign(console, original);
    window.electronAPI = { logError } as unknown as ElectronAPI;
  });

  afterEach(() => {
    uninstall();
    uninstall = () => undefined;
    restoreConsole();
    delete window.electronAPI;
  });

  it('tut ohne Electron nichts', () => {
    delete window.electronAPI;
    uninstall = installErrorReporting();
    expect(console.error).toBe(consoleError);
  });

  it('meldet console.error und console.warn und behält die Ausgabe', () => {
    uninstall = installErrorReporting();
    console.error('Fehler beim Laden:', new Error('kaputt'));
    console.warn('nur ein Hinweis');

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledWith('nur ein Hinweis');
    expect(logError).toHaveBeenCalledTimes(2);
    expect(logError.mock.calls[0][0]).toMatchObject({ level: 'error' });
    expect(logError.mock.calls[0][0].message).toContain('Fehler beim Laden: Error: kaputt');
    expect(logError.mock.calls[1][0]).toEqual({ level: 'warn', message: 'nur ein Hinweis' });
  });

  it('meldet nicht abgefangene Fehler und abgelehnte Promises', () => {
    uninstall = installErrorReporting();
    window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('x ist keine Funktion'), message: 'egal' }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.', filename: 'app.js', lineno: 3, colno: 9 }));
    const rejection = new Event('unhandledrejection') as Event & { reason?: unknown };
    rejection.reason = new Error('Netz weg');
    window.dispatchEvent(rejection);

    const messages = logError.mock.calls.map(([entry]) => entry.message as string);
    expect(messages[0]).toContain('Nicht abgefangener Fehler: TypeError: x ist keine Funktion');
    expect(messages[1]).toBe('Nicht abgefangener Fehler: Script error. (app.js:3:9)');
    expect(messages[2]).toContain('Unbehandelte Ablehnung: Error: Netz weg');
  });

  it('stört nicht, wenn das Melden selbst scheitert', () => {
    logError.mockImplementation(() => {
      throw new Error('IPC weg');
    });
    uninstall = installErrorReporting();
    expect(() => console.error('x')).not.toThrow();
  });

  it('stellt beim Lösen alles wieder her', () => {
    installErrorReporting()();
    expect(console.error).toBe(consoleError);
    window.dispatchEvent(new ErrorEvent('error', { message: 'danach' }));
    expect(logError).not.toHaveBeenCalled();
  });
});
