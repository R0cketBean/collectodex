import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider, NOTICE_MS, UNDO_MS, useFeedback } from './FeedbackContext';

const undo = vi.fn();
let answer: boolean | undefined;

const Probe = () => {
  const { notify, confirm } = useFeedback();
  return (
    <>
      <button onClick={() => notify('Gespeichert')}>melden</button>
      <button onClick={() => notify('2 Einträge gelöscht', { undo })}>löschen</button>
      <button
        onClick={async () => {
          answer = await confirm({ title: 'Kategorie löschen?', confirmLabel: 'Kategorie löschen', danger: true });
        }}
      >
        fragen
      </button>
      <input aria-label="feld" />
    </>
  );
};

const setup = () =>
  render(
    <FeedbackProvider>
      <Probe />
    </FeedbackProvider>
  );

beforeEach(() => {
  vi.useFakeTimers();
  undo.mockClear();
  answer = undefined;
});
afterEach(() => vi.useRealTimers());

describe('Meldungen', () => {
  it('verschwinden von selbst', () => {
    setup();
    fireEvent.click(screen.getByText('melden'));
    expect(screen.getByRole('status')).toHaveTextContent('Gespeichert');
    expect(screen.queryByText('Rückgängig')).toBeNull();
    act(() => void vi.advanceTimersByTime(NOTICE_MS + 10));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('bieten Rückgängig länger an und nehmen die Änderung per Knopf zurück', () => {
    setup();
    fireEvent.click(screen.getByText('löschen'));
    act(() => void vi.advanceTimersByTime(NOTICE_MS + 10));
    fireEvent.click(screen.getByText('Rückgängig'));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('lassen Rückgängig nach Ablauf der Frist nicht mehr zu', () => {
    setup();
    fireEvent.click(screen.getByText('löschen'));
    act(() => void vi.advanceTimersByTime(UNDO_MS + 10));
    expect(screen.queryByText('Rückgängig')).toBeNull();
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(undo).not.toHaveBeenCalled();
  });

  it('nehmen die Änderung mit Cmd/Strg+Z zurück, aber nicht beim Tippen in einem Feld', () => {
    setup();
    fireEvent.click(screen.getByText('löschen'));
    fireEvent.keyDown(screen.getByLabelText('feld'), { key: 'z', metaKey: true });
    expect(undo).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
  });
});

describe('Bestätigungsdialog', () => {
  it('liefert die Antwort und legt den Fokus bei riskanten Schritten auf Abbrechen', async () => {
    setup();
    fireEvent.click(screen.getByText('fragen'));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Kategorie löschen?');
    expect(screen.getByText('Abbrechen')).toHaveFocus();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Kategorie löschen' }));
    });
    expect(answer).toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('gilt mit Esc als abgelehnt', async () => {
    setup();
    fireEvent.click(screen.getByText('fragen'));
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    });
    expect(answer).toBe(false);
  });
});
