import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ErrorLogSection, { describeLog, formatLogSize } from './ErrorLogSection';
import type { ElectronAPI, LogInfo } from '../../types/electron';

const install = (info: LogInfo, extra: Partial<ElectronAPI> = {}) => {
  const api = {
    getLogInfo: vi.fn().mockResolvedValue(info),
    openLog: vi.fn().mockResolvedValue(true),
    exportLog: vi.fn().mockResolvedValue({ ok: true, path: '/Users/x/Downloads/protokoll.txt' }),
    ...extra,
  };
  window.electronAPI = api as unknown as ElectronAPI;
  return api;
};

afterEach(() => {
  delete window.electronAPI;
});

describe('formatLogSize / describeLog', () => {
  it('schreibt Größen deutsch', () => {
    expect(formatLogSize(512)).toBe('512 Byte');
    expect(formatLogSize(1536)).toBe('1,5 KB');
    expect(formatLogSize(3 * 1024 * 1024)).toBe('3 MB');
  });

  it('beschreibt leeres und gefülltes Protokoll', () => {
    expect(describeLog(null)).toBe('');
    expect(describeLog({ bytes: 0, updatedAt: null, exists: false })).toBe('Noch keine Einträge.');
    expect(describeLog({ bytes: 2048, updatedAt: '2026-11-12T20:00:00.000Z', exists: true })).toMatch(
      /^2 KB, letzter Eintrag am 12\.11\.2026, \d{2}:\d{2}\.$/
    );
  });
});

describe('ErrorLogSection', () => {
  it('verweist im Browser auf die installierte App', () => {
    render(<ErrorLogSection />);
    expect(screen.getByText(/nur in der installierten App/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Exportieren/ })).not.toBeInTheDocument();
  });

  it('sperrt „anzeigen“, solange es kein Protokoll gibt', async () => {
    install({ bytes: 0, updatedAt: null, exists: false });
    render(<ErrorLogSection />);
    expect(await screen.findByText('Noch keine Einträge.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Protokoll anzeigen' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exportieren…' })).toBeEnabled();
  });

  it('öffnet und exportiert das Protokoll', async () => {
    const api = install({ bytes: 4096, updatedAt: '2026-11-12T20:00:00.000Z', exists: true });
    render(<ErrorLogSection />);
    const open = screen.getByRole('button', { name: 'Protokoll anzeigen' });
    await waitFor(() => expect(open).toBeEnabled());

    fireEvent.click(open);
    await waitFor(() => expect(api.openLog).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Exportieren…' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Gespeichert: /Users/x/Downloads/protokoll.txt');
  });

  it('bleibt still, wenn der Export abgebrochen wird, und meldet Fehler', async () => {
    const api = install(
      { bytes: 10, updatedAt: null, exists: true },
      { exportLog: vi.fn().mockResolvedValueOnce({ ok: false, canceled: true }).mockResolvedValueOnce({ ok: false, error: 'kein Platz' }) }
    );
    render(<ErrorLogSection />);
    const button = screen.getByRole('button', { name: 'Exportieren…' });

    fireEvent.click(button);
    await waitFor(() => expect(api.exportLog).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(await screen.findByRole('status')).toHaveTextContent('Fehler: kein Platz');
  });
});
