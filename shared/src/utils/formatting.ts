/**
 * Formats a Shopee raw price (integer, price/100000) to "Rp X.XXX" format.
 * Uses id-ID locale for proper Indonesian number formatting.
 */
export function formatShopeePrice(priceRaw: number): string {
  const price = Math.floor(priceRaw / 100000);
  const formatted = new Intl.NumberFormat('id-ID').format(price);
  return `Rp ${formatted}`;
}

/**
 * Formats a rating number to one decimal place string.
 */
export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

/**
 * Truncates text to maxLength characters (default 200) and appends "..." if longer.
 * Returns the original string if its length is ≤ maxLength.
 */
export function truncatePrompt(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + '...';
}
