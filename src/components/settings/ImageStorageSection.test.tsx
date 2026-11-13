import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ImageStorageSection, { describeOrphans, describeUsage } from './ImageStorageSection';
import { FeedbackProvider } from '../../context/FeedbackContext';
import type { ElectronAPI, ImageUsage } from '../../types/electron';

const MB = 1024 * 1024;
const usage = (patch: Partial<ImageUsage> = {}): ImageUsage => ({
  files: 501,
  bytes: 67 * MB,
  orphanFiles: 14,
  orphanBytes: 3 * MB,
  blocked: false,
  legacyBackupBytes: null,
  ...patch,
});

const install = (first: ImageUsage, extra: Partial<ElectronAPI> = {}) => {
  const api = {
    getImageUsage: vi.fn().mockResolvedValue(first),
    cleanupImages: vi.fn().mockResolvedValue({ blocked: false, removed: 14, bytes: 3 * MB, failed: 0 }),
    trashLegacyBackup: vi.fn().mockResolvedValue(true),
    ...extra,
  };
  window.electronAPI = api as unknown as ElectronAPI;
  return api;
};

const renderSection = () =>
  render(
    <FeedbackProvider>
      <ImageStorageSection />
    </FeedbackProvider>
  );

afterEach(() => {
  delete window.electronAPI;
});

describe('describeUsage / describeOrphans', () => {
  it('beschreibt Belegung und Dateien ohne Eintrag', () => {
    expect(describeUsage(usage())).toBe('501 Dateien, 67 MB.');
    expect(describeUsage(usage({ files: 0, bytes: 0 }))).toBe('Noch keine Bilder abgelegt.');
    expect(describeOrphans(usage())).toBe('14 Dateien (3 MB) gehören zu keinem Eintrag mehr.');
    expect(describeOrphans(usage({ orphanFiles: 1, orphanBytes: 2048 }))).toBe('1 Datei (2 KB) gehört zu keinem Eintrag mehr.');
    expect(describeOrphans(usage({ orphanFiles: 0, orphanBytes: 0 }))).toBe('Alle Dateien gehören zu einem Eintrag.');
    expect(describeOrphans(usage({ blocked: true }))).toMatch(/keine Einträge geladen/);
  });
});

describe('ImageStorageSection', () => {
  it('verweist im Browser auf die installierte App', () => {
    renderSection();
    expect(screen.getByText(/nur in der installierten App/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aufräumen' })).not.toBeInTheDocument();
  });

  it('sperrt das Aufräumen, wenn nichts verwaist ist oder die Sammlung leer ist', async () => {
    install(usage({ orphanFiles: 0, orphanBytes: 0 }));
    const { unmount } = renderSection();
    expect(await screen.findByText('Alle Dateien gehören zu einem Eintrag.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aufräumen' })).toBeDisabled();
    unmount();

    install(usage({ blocked: true }));
    renderSection();
    expect(await screen.findByText(/keine Einträge geladen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aufräumen' })).toBeDisabled();
  });

  it('räumt erst nach der Rückfrage auf und zählt danach neu', async () => {
    const getImageUsage = vi
      .fn()
      .mockResolvedValueOnce(usage())
      .mockResolvedValue(usage({ files: 487, orphanFiles: 0, orphanBytes: 0 }));
    const api = install(usage(), { getImageUsage });
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Aufräumen' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('14 Dateien in den Papierkorb legen?');
    expect(api.cleanupImages).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Aufräumen' }));
    expect(await screen.findByText('14 Dateien in den Papierkorb gelegt (3 MB).')).toBeInTheDocument();
    expect(api.cleanupImages).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Alle Dateien gehören zu einem Eintrag.')).toBeInTheDocument();
  });

  it('räumt nicht auf, wenn die Rückfrage abgelehnt wird', async () => {
    const api = install(usage());
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Aufräumen' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.cleanupImages).not.toHaveBeenCalled();
  });

  it('meldet Dateien, die sich nicht verschieben ließen', async () => {
    install(usage(), { cleanupImages: vi.fn().mockResolvedValue({ blocked: false, removed: 12, bytes: MB, failed: 2 }) });
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Aufräumen' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Aufräumen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('2 Dateien ließen sich nicht verschieben');
  });

  it('bietet die alte Sicherungskopie nur an, wenn es sie gibt', async () => {
    const api = install(usage({ legacyBackupBytes: 86 * MB }));
    renderSection();
    expect(await screen.findByText(/Kopie der alten\s+Datendatei angelegt \(86 MB\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'In den Papierkorb legen' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'In den Papierkorb' }));
    expect(await screen.findByText('Sicherungskopie in den Papierkorb gelegt.')).toBeInTheDocument();
    expect(api.trashLegacyBackup).toHaveBeenCalledTimes(1);
  });

  it('zeigt ohne Sicherungskopie keinen Hinweis darauf', async () => {
    install(usage());
    renderSection();
    await screen.findByRole('button', { name: 'Aufräumen' });
    expect(screen.queryByText(/Sicherungskopie/)).not.toBeInTheDocument();
  });
});
