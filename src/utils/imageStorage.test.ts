import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CollectionItem } from '../types/models';
import { externalizeItemImages, fitWithin, inlineItemImages, isImageRef, storeImage } from './imageStorage';

const DATA = 'data:image/png;base64,AAAA';
const REF = 'cdx-image://local/abc.png';
const item = (images?: Record<string, string>): CollectionItem =>
  ({ id: 'i', categoryId: 'c', values: {}, images, createdAt: new Date(), updatedAt: new Date() }) as CollectionItem;

const setApi = (api: Record<string, unknown> | undefined) => {
  (window as unknown as { electronAPI?: unknown }).electronAPI = api;
};
afterEach(() => setApi(undefined));

describe('fitWithin', () => {
  it('verkleinert auf die längste Kante und vergrößert nie', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('ohne Electron (Browser)', () => {
  it('lässt Bilder als Data-URL', async () => {
    expect(await storeImage(DATA)).toBe(DATA);
    const items = [item({ image: DATA })];
    expect(await externalizeItemImages(items)).toBe(items);
    expect(await inlineItemImages(items)).toBe(items);
  });
});

describe('in der App', () => {
  it('legt Data-URLs ab und merkt sich den Verweis', async () => {
    const saveImage = vi.fn().mockResolvedValue(REF);
    setApi({ saveImage });
    expect(await storeImage(DATA)).toBe(REF);
    const [out] = await externalizeItemImages([item({ image: DATA, imageBack: 'https://x/y.webp' })]);
    expect(out.images).toEqual({ image: REF, imageBack: 'https://x/y.webp' });
    expect(isImageRef(out.images!.image)).toBe(true);
  });

  it('behält die Data-URL, wenn das Ablegen scheitert', async () => {
    setApi({ saveImage: vi.fn().mockResolvedValue(null) });
    expect(await storeImage(DATA)).toBe(DATA);
    setApi({ saveImage: vi.fn().mockRejectedValue(new Error('voll')) });
    const [out] = await externalizeItemImages([item({ image: DATA })]);
    expect(out.images).toEqual({ image: DATA });
  });

  it('bettet Verweise für den Export wieder ein und lässt Fehlendes stehen', async () => {
    const readImage = vi.fn(async (ref: string) => (ref === REF ? DATA : null));
    setApi({ readImage });
    const source = [item({ image: REF, imageBack: 'cdx-image://local/fehlt.png' }), item()];
    const out = await inlineItemImages(source);
    expect(out[0].images).toEqual({ image: DATA, imageBack: 'cdx-image://local/fehlt.png' });
    expect(out[1]).toBe(source[1]);
    expect(source[0].images!.image).toBe(REF);
  });
});
