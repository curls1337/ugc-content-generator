/**
 * Result type for URL validation.
 */
export type UrlValidationResult =
  | { valid: true }
  | { valid: false; error: string };

/**
 * Validates whether a string is a valid URL with http:// or https:// protocol.
 *
 * Rejects:
 * - Empty strings
 * - Whitespace-only strings
 * - Strings missing a valid protocol (http:// or https://)
 * - Strings missing a domain after the protocol
 *
 * @param url - The string to validate
 * @returns { valid: true } if the string is a valid URL, { valid: false, error: string } otherwise
 */
export function isValidUrl(url: string): UrlValidationResult {
  if (!url || url.trim().length === 0) {
    return { valid: false, error: 'A valid product URL is required' };
  }

  const trimmed = url.trim();

  try {
    const parsed = new URL(trimmed);

    // Only allow http and https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'URL must use http:// or https:// protocol' };
    }

    // Ensure there's a valid hostname (not empty)
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return { valid: false, error: 'URL must contain a valid domain' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format: missing protocol or domain' };
  }
}
