import type { GenerationSession } from '../types';

/**
 * Returns a new array of sessions sorted by createdAt descending (most recent first).
 */
export function sortSessionsDescending(
  sessions: GenerationSession[]
): GenerationSession[] {
  return [...sessions].sort((a, b) => b.createdAt - a.createdAt);
}
