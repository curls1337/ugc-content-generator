import { describe, it, expect } from 'vitest';
import { sortSessionsDescending } from './session-sorter';
import type { GenerationSession } from '../types';

function makeSession(id: string, createdAt: number): GenerationSession {
  return {
    id,
    productTitle: `Product ${id}`,
    mode: 'image',
    items: [],
    createdAt,
  };
}

describe('sortSessionsDescending', () => {
  it('returns empty array for empty input', () => {
    expect(sortSessionsDescending([])).toEqual([]);
  });

  it('returns single session unchanged', () => {
    const sessions = [makeSession('a', 1000)];
    expect(sortSessionsDescending(sessions)).toEqual(sessions);
  });

  it('sorts sessions by createdAt descending', () => {
    const sessions = [
      makeSession('old', 1000),
      makeSession('new', 3000),
      makeSession('mid', 2000),
    ];
    const sorted = sortSessionsDescending(sessions);
    expect(sorted[0].id).toBe('new');
    expect(sorted[1].id).toBe('mid');
    expect(sorted[2].id).toBe('old');
  });

  it('does not mutate the original array', () => {
    const sessions = [
      makeSession('a', 1000),
      makeSession('b', 3000),
    ];
    const original = [...sessions];
    sortSessionsDescending(sessions);
    expect(sessions).toEqual(original);
  });

  it('handles already sorted input', () => {
    const sessions = [
      makeSession('newest', 3000),
      makeSession('middle', 2000),
      makeSession('oldest', 1000),
    ];
    const sorted = sortSessionsDescending(sessions);
    expect(sorted[0].id).toBe('newest');
    expect(sorted[2].id).toBe('oldest');
  });
});
