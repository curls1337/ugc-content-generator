/**
 * Key Rotator utility for Gemini API key management.
 *
 * Distributes API calls across multiple keys with:
 * - Random shuffle on each call for even distribution
 * - Immediate rotation on HTTP 429 (quota/rate-limit)
 * - Retry with exponential backoff on transient errors (502, 503, 504)
 * - Up to 3 retries per key before rotating
 * - Throws "all keys exhausted" when no keys remain
 * - Throws immediate error when zero keys provided
 */

/** Quota/rate-limit error — rotate immediately (key exhausted, no point retrying same key) */
export function isQuotaError(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests")
  );
}

/** Transient server error — retry same key with backoff */
export function isTransientError(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("overloaded") ||
    msg.includes("high demand") ||
    msg.includes("service unavailable") ||
    msg.includes("timeout")
  );
}

/**
 * Run a Gemini API call with retry + key rotation.
 *
 * - Quota/429 errors → immediately rotate to next key (no retry on same key)
 * - Transient server errors (502/503/504/overloaded/timeout) → retry same key up to 3× with exponential backoff
 * - Non-retryable errors → throw immediately
 * - All keys exhausted → throw "all keys exhausted" error
 *
 * @param keys - Array of API keys to rotate through
 * @param modelName - The Gemini model name to use
 * @param fn - The function to execute with (apiKey, modelName) parameters
 * @returns The result of the successful function call
 */
export async function withGeminiRetry<T>(
  keys: string[],
  modelName: string,
  fn: (apiKey: string, modelName: string) => Promise<T>
): Promise<T> {
  if (!keys.length) {
    throw new Error("No API keys available");
  }

  // Shuffle keys randomly so each call starts from a different key
  // This distributes quota load evenly across all keys
  const shuffled = [...keys].sort(() => Math.random() - 0.5);

  let lastErr: any;

  for (let ki = 0; ki < shuffled.length; ki++) {
    const key = shuffled[ki];
    const isLastKey = ki === shuffled.length - 1;
    let skipKey = false;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await fn(key, modelName);
      } catch (err: any) {
        lastErr = err;
        const errSnip = String(err?.message || err).slice(0, 150);

        if (isQuotaError(err)) {
          // Quota exhausted on this key — immediately rotate to next key
          console.warn(
            `[key-rotator] key[${ki + 1}/${shuffled.length}] quota/rate-limit → rotate. ${errSnip}`
          );
          skipKey = true;
          break;
        }

        if (!isTransientError(err)) {
          // Non-retryable error — throw immediately
          throw err;
        }

        // Transient error — retry with backoff
        console.warn(
          `[key-rotator] key[${ki + 1}/${shuffled.length}] attempt ${attempt}/3 transient: ${errSnip}`
        );

        if (attempt === 3) {
          // Exhausted retries on this key — rotate to next
          if (!isLastKey) {
            console.warn(`[key-rotator] rotating after 3 transient failures`);
            break;
          }
          // Last key, last attempt — will fall through to throw
        } else {
          // Wait with exponential backoff: 2000ms × attempt number
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
      }
    }

    if (skipKey && isLastKey) break;
  }

  throw lastErr || new Error("All API keys exhausted");
}
