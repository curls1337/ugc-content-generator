import { describe, it, expect, vi } from 'vitest';
import { scrapeProduct, detectPlatform } from './index';

// Mock the actual scrapers since they require a browser
vi.mock('./tokopedia', () => ({
  scrapeTokopedia: vi.fn().mockResolvedValue({
    platform: 'tokopedia',
    url: 'https://www.tokopedia.com/shop/product',
    title: 'Test Product',
    description: 'A test product',
    price: 'Rp 100.000',
    images: [],
    scrapedAt: Date.now(),
  }),
}));

vi.mock('./shopee', () => ({
  scrapeShopee: vi.fn().mockResolvedValue({
    platform: 'shopee',
    url: 'https://shopee.co.id/product/123/456',
    title: 'Shopee Product',
    description: 'A shopee product',
    price: 'Rp 50.000',
    images: [],
    scrapedAt: Date.now(),
  }),
}));

describe('scrapeProduct', () => {
  it('routes Tokopedia URLs to scrapeTokopedia', async () => {
    const result = await scrapeProduct('https://www.tokopedia.com/shop/product');
    expect(result.platform).toBe('tokopedia');
  });

  it('routes tokopedia.link URLs to scrapeTokopedia', async () => {
    const result = await scrapeProduct('https://tokopedia.link/abc123');
    expect(result.platform).toBe('tokopedia');
  });

  it('routes Shopee URLs to scrapeShopee', async () => {
    const result = await scrapeProduct('https://shopee.co.id/product/123/456');
    expect(result.platform).toBe('shopee');
  });

  it('routes shp.ee short URLs to scrapeShopee', async () => {
    const result = await scrapeProduct('https://shp.ee/abc123');
    expect(result.platform).toBe('shopee');
  });

  it('throws descriptive error for unknown platforms', async () => {
    await expect(scrapeProduct('https://amazon.com/product/123')).rejects.toThrow(
      'URL tidak dikenali. Hanya Tokopedia & Shopee yang didukung.'
    );
  });
});

describe('detectPlatform re-export', () => {
  it('is re-exported from the index module', () => {
    expect(detectPlatform).toBeDefined();
    expect(typeof detectPlatform).toBe('function');
  });

  it('correctly detects tokopedia', () => {
    expect(detectPlatform('https://www.tokopedia.com/shop/item')).toBe('tokopedia');
  });

  it('correctly detects shopee', () => {
    expect(detectPlatform('https://shopee.co.id/item.123.456')).toBe('shopee');
  });

  it('returns unknown for unrecognized URLs', () => {
    expect(detectPlatform('https://example.com')).toBe('unknown');
  });
});
