/**
 * Parses a multiline string of API keys.
 * Splits by newline, trims whitespace from each line, filters empty lines,
 * and returns at most 20 entries.
 */
export function parseApiKeys(input: string): string[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 20);
}
