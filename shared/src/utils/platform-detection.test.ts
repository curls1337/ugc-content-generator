import { describe, it, expect } from 'vitest';
import { detectPlatform } from './platform-detection';

describe('detectPlatform', () => {
  describe('Tokopedia detection', () => {
    it('detects tokopedia.com URLs', () => {
      expect(detectPlatform('https://www.tokopedia.com/shop/product-name')).toBe('tokopedia');
    });

    it('detects tokopedia.link URLs', () => {
      expect(detectPlatform('https://tokopedia.link/abc123')).toBe('tokopedia');
    });

    it('is case-insensitive for tokopedia', () => {
      expect(detectPlatform('https://WWW.TOKOPEDIA.COM/shop/item')).toBe('tokopedia');
      expect(detectPlatform('https://Tokopedia.Link/xyz')).toBe('tokopedia');
    });
  });

  describe('Shopee detection', () => {
    it('detects shopee.co.id URLs', () => {
      expect(detectPlatform('https://shopee.co.id/product/123/456')).toBe('shopee');
    });

    it('detects shopee.com URLs', () => {
      expect(detectPlatform('https://shopee.com/product/123/456')).toBe('shopee');
    });

    it('detects shp.ee short URLs', () => {
      expect(detectPlatform('https://shp.ee/abc123')).toBe('shopee');
    });

    it('is case-insensitive for shopee', () => {
      expect(detectPlatform('https://SHOPEE.CO.ID/item')).toBe('shopee');
      expect(detectPlatform('https://SHP.EE/xyz')).toBe('shopee');
    });
  });

  describe('Unknown platform', () => {
    it('returns unknown for unrecognized URLs', () => {
      expect(detectPlatform('https://amazon.com/product/123')).toBe('unknown');
      expect(detectPlatform('https://bukalapak.com/item/456')).toBe('unknown');
    });

    it('returns unknown for empty string', () => {
      expect(detectPlatform('')).toBe('unknown');
    });

    it('returns unknown for random text', () => {
      expect(detectPlatform('not a url at all')).toBe('unknown');
    });
  });
});
