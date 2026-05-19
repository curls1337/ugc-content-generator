import type { Platform } from '../types';

/**
 * Detects the e-commerce platform from a URL string.
 *
 * Performs case-insensitive matching against known platform domains:
 * - "tokopedia.com" or "tokopedia.link" → "tokopedia"
 * - "shopee.co.id", "shopee.com", or "shp.ee" → "shopee"
 * - All other URLs → "unknown"
 *
 * Operates on the raw input string without URL resolution or redirection.
 *
 * @param url - The URL string to detect the platform from
 * @returns The detected platform identifier
 */
export function detectPlatform(url: string): Platform {
  const u = url.toLowerCase();

  if (u.includes('tokopedia.com') || u.includes('tokopedia.link')) {
    return 'tokopedia';
  }

  if (u.includes('shopee.co.id') || u.includes('shopee.com') || u.includes('shp.ee')) {
    return 'shopee';
  }

  return 'unknown';
}
