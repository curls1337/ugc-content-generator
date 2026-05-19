import { describe, it, expect } from 'vitest';
import { formatShopeePrice, formatRating, truncatePrompt } from './formatting';

describe('formatShopeePrice', () => {
  it('formats zero price', () => {
    expect(formatShopeePrice(0)).toBe('Rp 0');
  });

  it('formats a typical Shopee raw price', () => {
    // 15000 * 100000 = 1500000000 raw → Rp 15.000
    expect(formatShopeePrice(1500000000)).toBe('Rp 15.000');
  });

  it('formats small price', () => {
    // 100000 raw → 1
    expect(formatShopeePrice(100000)).toBe('Rp 1');
  });

  it('formats large price with thousands separators', () => {
    // 1250000 * 100000 = 125000000000 raw → Rp 1.250.000
    expect(formatShopeePrice(125000000000)).toBe('Rp 1.250.000');
  });

  it('floors fractional division results', () => {
    // 150001 raw → floor(150001/100000) = 1
    expect(formatShopeePrice(150001)).toBe('Rp 1');
  });
});

describe('formatRating', () => {
  it('formats integer rating to one decimal', () => {
    expect(formatRating(5)).toBe('5.0');
  });

  it('formats rating with one decimal', () => {
    expect(formatRating(4.8)).toBe('4.8');
  });

  it('rounds to one decimal place', () => {
    expect(formatRating(4.86)).toBe('4.9');
    expect(formatRating(4.84)).toBe('4.8');
  });

  it('formats zero rating', () => {
    expect(formatRating(0)).toBe('0.0');
  });
});

describe('truncatePrompt', () => {
  it('returns original string if within default limit', () => {
    const text = 'Short prompt';
    expect(truncatePrompt(text)).toBe(text);
  });

  it('returns original string if exactly at limit', () => {
    const text = 'a'.repeat(200);
    expect(truncatePrompt(text)).toBe(text);
  });

  it('truncates and adds ellipsis when over default limit', () => {
    const text = 'a'.repeat(250);
    const result = truncatePrompt(text);
    expect(result).toBe('a'.repeat(200) + '...');
    expect(result.length).toBe(203);
  });

  it('respects custom maxLength', () => {
    const text = 'Hello World!';
    expect(truncatePrompt(text, 5)).toBe('Hello...');
  });

  it('returns original if at custom maxLength', () => {
    const text = 'Hello';
    expect(truncatePrompt(text, 5)).toBe('Hello');
  });

  it('handles empty string', () => {
    expect(truncatePrompt('')).toBe('');
  });
});
