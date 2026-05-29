import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './logger';

// Vitest läuft mit DEV=true, deshalb sollten debug/info hier echte
// console-Aufrufe absetzen. (Den DEV=false-Pfad könnte man nur über
// einen separaten Test-Build oder import.meta.env-Mock erzwingen — das
// sparen wir uns, weil die Wirkung im Production-Build durch das Vite-
// Const-Replacement garantiert ist und nicht durch unit tests prüfbar.)

describe('logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('routet debug auf console.log im Dev-Modus', () => {
    logger.debug('hallo', 42);
    expect(logSpy).toHaveBeenCalledWith('hallo', 42);
  });

  it('routet info auf console.info im Dev-Modus', () => {
    logger.info('hallo');
    expect(infoSpy).toHaveBeenCalledWith('hallo');
  });

  it('routet warn immer auf console.warn', () => {
    logger.warn('Achtung');
    expect(warnSpy).toHaveBeenCalledWith('Achtung');
  });

  it('routet error immer auf console.error', () => {
    const err = new Error('boom');
    logger.error('Fehler:', err);
    expect(errorSpy).toHaveBeenCalledWith('Fehler:', err);
  });
});
