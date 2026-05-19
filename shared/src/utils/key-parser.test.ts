import { describe, it, expect } from 'vitest';
import { parseApiKeys } from './key-parser';

describe('parseApiKeys', () => {
  it('parses single key', () => {
    expect(parseApiKeys('key1')).toEqual(['key1']);
  });

  it('parses multiple keys separated by newlines', () => {
    expect(parseApiKeys('key1\nkey2\nkey3')).toEqual(['key1', 'key2', 'key3']);
  });

  it('trims whitespace from each line', () => {
    expect(parseApiKeys('  key1  \n  key2  ')).toEqual(['key1', 'key2']);
  });

  it('filters out empty lines', () => {
    expect(parseApiKeys('key1\n\n\nkey2\n')).toEqual(['key1', 'key2']);
  });

  it('filters out whitespace-only lines', () => {
    expect(parseApiKeys('key1\n   \n\t\nkey2')).toEqual(['key1', 'key2']);
  });

  it('returns at most 20 entries', () => {
    const input = Array.from({ length: 25 }, (_, i) => `key${i}`).join('\n');
    const result = parseApiKeys(input);
    expect(result.length).toBe(20);
    expect(result[0]).toBe('key0');
    expect(result[19]).toBe('key19');
  });

  it('returns empty array for empty input', () => {
    expect(parseApiKeys('')).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(parseApiKeys('   \n  \n\t')).toEqual([]);
  });
});
