import { describe, it, expect } from 'vitest';
import { isValidUrl } from './url-validator';

describe('isValidUrl', () => {
  it('rejects empty string with error message', () => {
    const result = isValidUrl('');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBeDefined();
    }
  });

  it('rejects whitespace-only string with error message', () => {
    expect(isValidUrl('   ')).toEqual({ valid: false, error: 'A valid product URL is required' });
    expect(isValidUrl('\t\n')).toEqual({ valid: false, error: 'A valid product URL is required' });
  });

  it('rejects string without protocol', () => {
    const result = isValidUrl('tokopedia.com/product/123');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('Invalid URL format');
    }
  });

  it('rejects string with invalid protocol', () => {
    const result = isValidUrl('ftp://tokopedia.com/product');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('http:// or https://');
    }
  });

  it('rejects string without domain', () => {
    const result1 = isValidUrl('http://');
    expect(result1.valid).toBe(false);

    const result2 = isValidUrl('https://');
    expect(result2.valid).toBe(false);
  });

  it('accepts valid http URL', () => {
    expect(isValidUrl('http://tokopedia.com/product/123')).toEqual({ valid: true });
  });

  it('accepts valid https URL', () => {
    expect(isValidUrl('https://www.tokopedia.com/shop/product-name')).toEqual({ valid: true });
    expect(isValidUrl('https://shopee.co.id/product/123/456')).toEqual({ valid: true });
  });

  it('accepts URL with query parameters', () => {
    expect(isValidUrl('https://tokopedia.com/product?id=123&ref=home')).toEqual({ valid: true });
  });

  it('accepts URL with path and fragment', () => {
    expect(isValidUrl('https://shopee.co.id/item/123#details')).toEqual({ valid: true });
  });

  it('trims whitespace before validating', () => {
    expect(isValidUrl('  https://tokopedia.com/product  ')).toEqual({ valid: true });
  });
});
