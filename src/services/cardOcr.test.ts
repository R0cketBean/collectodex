// @vitest-environment node
import { createRequire } from 'node:module';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

// Modul des Hauptprozesses (CommonJS in public/), ohne Electron-Abhängigkeit.
const require = createRequire(import.meta.url);
const cardOcr = require('../../public/cardOcr.js');

describe('binaryPath', () => {
  it('liegt in der gepackten App unter Resources/bin, sonst unter native/bin', () => {
    expect(cardOcr.binaryPath({ isPackaged: true, resourcesPath: '/App/Contents/Resources', appRoot: '/x' })).toBe(
      path.join('/App/Contents/Resources', 'bin', 'card-ocr')
    );
    expect(cardOcr.binaryPath({ isPackaged: false, resourcesPath: '/r', appRoot: '/projekt' })).toBe(
      path.join('/projekt', 'native', 'bin', 'card-ocr')
    );
  });

  it('gibt es nur auf macOS', () => {
    expect(cardOcr.isAvailable(__filename, 'win32')).toBe(false);
    expect(cardOcr.isAvailable('/gibt/es/nicht', 'darwin')).toBe(false);
  });
});

describe('decodeImage', () => {
  it('nimmt Bilder als Data-URL an', () => {
    const { ext, data } = cardOcr.decodeImage(`data:image/jpeg;base64,${Buffer.from('abc').toString('base64')}`);
    expect(ext).toBe('jpg');
    expect(data.toString()).toBe('abc');
    expect(cardOcr.decodeImage('data:image/HEIC;base64,YQ==').ext).toBe('heic');
  });

  it.each([
    undefined,
    42,
    'data:text/html;base64,PGI+',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'file:///etc/passwd',
    'data:image/png;base64,',
  ])('lehnt %s ab', (value) => {
    expect(() => cardOcr.decodeImage(value)).toThrow();
  });

  it('lehnt zu große Bilder ab', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(cardOcr.MAX_DATA_URL_LENGTH);
    expect(() => cardOcr.decodeImage(huge)).toThrow(/zu groß/);
  });
});

describe('parseOutput', () => {
  it('behält nur die erwarteten Felder', () => {
    const out = cardOcr.parseOutput(
      JSON.stringify({
        width: 600,
        height: 825,
        cardDetected: true,
        lines: [
          { text: 'SVI DE', confidence: 0.5, pass: 'bottom', x: 0.05, y: 0.94, w: 0.1, h: 0.01, extra: 'weg' },
          { text: 7 },
          null,
          { text: 'Riesenzahn ex', pass: 'seltsam', x: 'a' },
        ],
      })
    );
    expect(out).toEqual({
      width: 600,
      height: 825,
      cardDetected: true,
      lines: [
        { text: 'SVI DE', confidence: 0.5, pass: 'bottom', x: 0.05, y: 0.94, w: 0.1, h: 0.01 },
        { text: 'Riesenzahn ex', confidence: 0, pass: 'full', x: 0, y: 0, w: 0, h: 0 },
      ],
    });
  });
});

describe('createWorker', () => {
  /** Nachgebautes Hilfsprogramm: antwortet auf Aufträge über `reply`. */
  const fakeProgram = (reply: (job: { image: string }) => object | null, { ready = true } = {}) => {
    const started: Array<{ kill: ReturnType<typeof vi.fn>; exit: () => void }> = [];
    const spawnFn = vi.fn(() => {
      const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: vi.fn(),
      });
      child.stdin.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n').filter(Boolean)) {
          const answer = reply(JSON.parse(line));
          if (answer) child.stdout.write(`${JSON.stringify(answer)}\n`);
        }
      });
      if (ready) setTimeout(() => child.stdout.write('{"ready":true}\n'), 5);
      started.push({ kill: child.kill, exit: () => child.emit('exit', 1) });
      return child;
    });
    return { spawnFn, started };
  };

  it('startet einmal und beantwortet Aufträge nacheinander', async () => {
    const { spawnFn } = fakeProgram((job) => ({ width: 1, height: 1, lines: [{ text: job.image }] }));
    const worker = cardOcr.createWorker('/bin/card-ocr', { spawnFn });
    worker.warmUp();
    const [a, b] = await Promise.all([worker.run('/a.jpg', '/p.jpg'), worker.run('/b.jpg', '/p.jpg')]);
    expect(a.lines[0].text).toBe('/a.jpg');
    expect(b.lines[0].text).toBe('/b.jpg');
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(spawnFn).toHaveBeenCalledWith('/bin/card-ocr', ['--serve'], expect.anything());
    worker.stop();
  });

  it('meldet Fehler des Programms und läuft weiter', async () => {
    const { spawnFn } = fakeProgram((job) => (job.image === '/kaputt.jpg' ? { error: 'Bild nicht lesbar' } : { lines: [] }));
    const worker = cardOcr.createWorker('/bin/card-ocr', { spawnFn });
    await expect(worker.run('/kaputt.jpg')).rejects.toThrow('Bild nicht lesbar');
    await expect(worker.run('/gut.jpg')).resolves.toEqual({ lines: [] });
    expect(spawnFn).toHaveBeenCalledTimes(1);
    worker.stop();
  });

  it('startet neu, wenn das Programm hängt oder abstürzt', async () => {
    let hang = true;
    const { spawnFn, started } = fakeProgram(() => (hang ? null : { lines: [] }));
    const worker = cardOcr.createWorker('/bin/card-ocr', { spawnFn, jobMs: 30 });
    await expect(worker.run('/a.jpg')).rejects.toThrow(/antwortet nicht/);
    expect(started[0].kill).toHaveBeenCalled();
    hang = false;
    await expect(worker.run('/a.jpg')).resolves.toEqual({ lines: [] });
    expect(spawnFn).toHaveBeenCalledTimes(2);

    // Absturz während des Wartens: Fehler, danach wieder neu.
    hang = true;
    const pending = worker.run('/b.jpg');
    await new Promise((r) => setTimeout(r, 10));
    started[1].exit();
    await expect(pending).rejects.toThrow(/beendet/);
    hang = false;
    await expect(worker.run('/c.jpg')).resolves.toEqual({ lines: [] });
    expect(spawnFn).toHaveBeenCalledTimes(3);
    worker.stop();
  });

  it('gibt auf, wenn das Programm nie bereit wird', async () => {
    const { spawnFn, started } = fakeProgram(() => ({ lines: [] }), { ready: false });
    const worker = cardOcr.createWorker('/bin/card-ocr', { spawnFn, readyMs: 30 });
    await expect(worker.run('/a.jpg')).rejects.toThrow(/startet nicht/);
    expect(started[0].kill).toHaveBeenCalled();
  });

  it('beendet das Programm nach einer Pause ohne Scan', async () => {
    const { spawnFn, started } = fakeProgram(() => ({ lines: [] }));
    const worker = cardOcr.createWorker('/bin/card-ocr', { spawnFn, idleMs: 30 });
    await worker.run('/a.jpg');
    await new Promise((r) => setTimeout(r, 60));
    expect(started[0].kill).toHaveBeenCalled();
    await worker.run('/b.jpg');
    expect(spawnFn).toHaveBeenCalledTimes(2);
    worker.stop();
  });
});
