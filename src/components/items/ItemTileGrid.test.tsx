import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CollectionItem } from '../../types/models';
import ItemTileGrid, { tileSubtitle } from './ItemTileGrid';

const item = (id: string, values: Record<string, unknown>, images?: Record<string, string>): CollectionItem =>
  ({ id, categoryId: 'singles', values, images, createdAt: new Date(), updatedAt: new Date() }) as CollectionItem;

describe('tileSubtitle', () => {
  it('nennt Stückzahl ab zwei und Erweiterung oder Produktart', () => {
    expect(tileSubtitle(item('a', { quantity: 1, expansion: '151' }))).toBe('151');
    expect(tileSubtitle(item('a', { quantity: 3, category: 'Booster' }))).toBe('3 Stück · Booster');
    expect(tileSubtitle(item('a', { quantity: 1 }))).toBe('');
  });
});

describe('ItemTileGrid', () => {
  const calculate = (i: CollectionItem) => ({
    totalValue: Number(i.values.quantity) * Number(i.values.currentValue),
    profitLoss: Number(i.values.quantity) * (Number(i.values.currentValue) - Number(i.values.purchasePrice)),
  });
  const items = [
    item('a', { name: 'Glurak', quantity: 2, purchasePrice: 10, currentValue: 25 }, { image: 'data:image/png;base64,AAAA' }),
    item('b', { name: 'Turtok', quantity: 1, purchasePrice: 30, currentValue: 20 }),
  ];

  it('zeigt Name, Wert und Gewinn/Verlust und meldet Klicks weiter', () => {
    const onOpen = vi.fn();
    const onToggleSelect = vi.fn();
    const onOpenImages = vi.fn();
    render(
      <ItemTileGrid
        items={items}
        calculateItemValue={calculate}
        selectedIds={['b']}
        onToggleSelect={onToggleSelect}
        onOpen={onOpen}
        onOpenImages={onOpenImages}
        highlightedItemId={null}
        highlightRef={{ current: null }}
      />
    );
    expect(screen.getByText('Glurak')).toBeInTheDocument();
    expect(screen.getByText(/50,00/)).toBeInTheDocument();
    expect(screen.getByText(/\+30,00/)).toBeInTheDocument();
    expect(screen.getByText(/[-−]10,00/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Glurak bearbeiten' }));
    expect(onOpen).toHaveBeenCalledWith(items[0]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Glurak auswählen' }));
    expect(onToggleSelect).toHaveBeenCalledWith('a');
    expect(screen.getByRole('checkbox', { name: 'Turtok auswählen' })).toBeChecked();
    // Nur Einträge mit Bild bieten die Großansicht an.
    fireEvent.click(screen.getByRole('button', { name: 'Bilder von Glurak ansehen' }));
    expect(onOpenImages).toHaveBeenCalledWith(items[0]);
    expect(screen.queryByRole('button', { name: 'Bilder von Turtok ansehen' })).toBeNull();
  });
});
