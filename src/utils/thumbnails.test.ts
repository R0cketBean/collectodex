import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureThumb, previewSource, smallRemoteImage, thumbRefFor } from './thumbnails';

describe('Vorschaubilder', () => {
  afterEach(() => {
    delete (window as { electronAPI?: unknown }).electronAPI;
  });

  it('leitet den Verweis auf das Vorschaubild aus dem Bildnamen ab', () => {
    expect(thumbRefFor('cdx-image://local/abc-123.jpg')).toBe('cdx-image://local/abc-123_thumb.webp');
    expect(thumbRefFor('cdx-image://local/abc-123.webp?x=1')).toBe('cdx-image://local/abc-123_thumb.webp');
  });

  it('kennt kein Vorschaubild für Vorschaubilder, Data-URLs und Internetadressen', () => {
    expect(thumbRefFor('cdx-image://local/abc_thumb.webp')).toBeNull();
    expect(thumbRefFor('cdx-image://local/../geheim.json')).toBeNull();
    expect(thumbRefFor('data:image/png;base64,AAAA')).toBeNull();
    expect(thumbRefFor('https://assets.tcgdex.net/de/sv/sv01/1/high.webp')).toBeNull();
  });

  it('nimmt für Katalogbilder die kleine Fassung der Quelle', () => {
    expect(smallRemoteImage('https://assets.tcgdex.net/de/sv/sv01/1/high.webp')).toBe(
      'https://assets.tcgdex.net/de/sv/sv01/1/low.webp'
    );
    expect(smallRemoteImage('https://images.pokemontcg.io/base1/4_hires.png')).toBe(
      'https://images.pokemontcg.io/base1/4.png'
    );
    expect(smallRemoteImage('https://example.com/a/high.webp')).toBe('https://example.com/a/high.webp');
    expect(previewSource('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(previewSource('cdx-image://local/neu.jpg')).toBe('cdx-image://local/neu_thumb.webp');
  });

  it('erzeugt ohne Bildablage nichts', async () => {
    expect(await ensureThumb('cdx-image://local/abc.jpg')).toBeNull();
    expect(await ensureThumb('https://example.com/a.png')).toBeNull();
  });

  it('liefert null, wenn sich das Original nicht lesen lässt, und fragt nur einmal', async () => {
    const readImage = vi.fn(async () => null);
    const saveThumbnail = vi.fn(async () => 'cdx-image://local/fehlt_thumb.webp');
    (window as { electronAPI?: unknown }).electronAPI = { readImage, saveThumbnail };
    const [a, b] = await Promise.all([ensureThumb('cdx-image://local/fehlt.jpg'), ensureThumb('cdx-image://local/fehlt.jpg')]);
    expect([a, b]).toEqual([null, null]);
    expect(readImage).toHaveBeenCalledTimes(1);
    expect(saveThumbnail).not.toHaveBeenCalled();
  });
});
