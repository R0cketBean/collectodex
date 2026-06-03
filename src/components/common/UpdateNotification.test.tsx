import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import UpdateNotification from './UpdateNotification';

// Wir mocken die in preload.js bereitgestellte electronAPI. Die on*-Methoden
// speichern den vom Component übergebenen Callback, damit der Test die
// Main-Prozess-Events (update:available, :progress, :downloaded, :error)
// gezielt auslösen kann. Sie geben — wie das echte Preload — eine
// Cleanup-Funktion zurück.
type Cb<T> = (info: T) => void;

const installElectronAPI = () => {
  const callbacks: Record<string, Cb<any> | undefined> = {};
  const make = (name: string) =>
    vi.fn((cb: Cb<any>) => {
      callbacks[name] = cb;
      return vi.fn(); // Cleanup
    });

  const api = {
    onUpdateAvailable: make('available'),
    onUpdateProgress: make('progress'),
    onUpdateDownloaded: make('downloaded'),
    onUpdateError: make('error'),
    downloadUpdate: vi.fn().mockResolvedValue(true),
    installUpdate: vi.fn().mockResolvedValue(true),
  };
  (window as any).electronAPI = api;
  return { api, callbacks };
};

const removeElectronAPI = () => {
  delete (window as any).electronAPI;
};

beforeEach(() => {
  removeElectronAPI();
});

afterEach(() => {
  removeElectronAPI();
  vi.restoreAllMocks();
});

describe('UpdateNotification', () => {
  it('rendert nichts ohne electronAPI (Browser/Dev)', () => {
    const { container } = render(<UpdateNotification />);
    expect(container).toBeEmptyDOMElement();
  });

  it('rendert initial nichts, auch mit electronAPI (Status idle)', () => {
    installElectronAPI();
    const { container } = render(<UpdateNotification />);
    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt bei update:available den Hinweis und löst Download per Button aus', () => {
    const { api, callbacks } = installElectronAPI();
    render(<UpdateNotification />);

    act(() => callbacks.available!({ version: '0.3.0' }));

    expect(screen.getByText('Update verfügbar')).toBeInTheDocument();
    expect(screen.getByText(/Version 0\.3\.0/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Herunterladen' }));
    expect(api.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it('zeigt nach update:downloaded den Neustart-Hinweis und installiert per Button', () => {
    const { api, callbacks } = installElectronAPI();
    render(<UpdateNotification />);

    act(() => callbacks.downloaded!({ version: '0.3.0' }));

    expect(screen.getByText('Update bereit')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Neu starten' }));
    expect(api.installUpdate).toHaveBeenCalledTimes(1);
  });

  it('zeigt den Fortschritt bei update:progress', () => {
    const { callbacks } = installElectronAPI();
    render(<UpdateNotification />);

    act(() => callbacks.progress!({ percent: 42.7 }));

    expect(screen.getByText('Update wird geladen…')).toBeInTheDocument();
    expect(screen.getByText('43%')).toBeInTheDocument();
  });

  it('zeigt eine Fehlermeldung bei update:error', () => {
    const { callbacks } = installElectronAPI();
    render(<UpdateNotification />);

    act(() => callbacks.error!({ message: 'Netzwerkfehler' }));

    expect(screen.getByText('Update fehlgeschlagen')).toBeInTheDocument();
    expect(screen.getByText('Netzwerkfehler')).toBeInTheDocument();
  });
});
