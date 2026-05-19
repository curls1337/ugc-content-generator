import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withGeminiRetry, isQuotaError, isTransientError } from './key-rotator';

describe('isQuotaError', () => {
  it('detects "quota" in error message', () => {
    expect(isQuotaError(new Error('Resource has been exhausted (quota)'))).toBe(true);
  });

  it('detects "429" in error message', () => {
    expect(isQuotaError(new Error('HTTP 429 Too Many Requests'))).toBe(true);
  });

  it('detects "rate limit" in error message', () => {
    expect(isQuotaError(new Error('Rate limit exceeded'))).toBe(true);
  });

  it('detects "too many requests" in error message', () => {
    expect(isQuotaError(new Error('Too many requests'))).toBe(true);
  });

  it('returns false for non-quota errors', () => {
    expect(isQuotaError(new Error('Internal server error'))).toBe(false);
  });

  it('handles non-Error values', () => {
    expect(isQuotaError('quota exceeded')).toBe(true);
    expect(isQuotaError(null)).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
  });
});

describe('isTransientError', () => {
  it('detects "502" in error message', () => {
    expect(isTransientError(new Error('HTTP 502 Bad Gateway'))).toBe(true);
  });

  it('detects "503" in error message', () => {
    expect(isTransientError(new Error('HTTP 503 Service Unavailable'))).toBe(true);
  });

  it('detects "504" in error message', () => {
    expect(isTransientError(new Error('HTTP 504 Gateway Timeout'))).toBe(true);
  });

  it('detects "overloaded" in error message', () => {
    expect(isTransientError(new Error('Model is overloaded'))).toBe(true);
  });

  it('detects "high demand" in error message', () => {
    expect(isTransientError(new Error('Service experiencing high demand'))).toBe(true);
  });

  it('detects "service unavailable" in error message', () => {
    expect(isTransientError(new Error('Service unavailable'))).toBe(true);
  });

  it('detects "timeout" in error message', () => {
    expect(isTransientError(new Error('Request timeout'))).toBe(true);
  });

  it('returns false for non-transient errors', () => {
    expect(isTransientError(new Error('Invalid API key'))).toBe(false);
  });
});

describe('withGeminiRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws immediately when zero keys provided', async () => {
    const fn = vi.fn();
    await expect(withGeminiRetry([], 'gemini-2.5-flash', fn)).rejects.toThrow(
      'No API keys available'
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('returns result on successful call', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withGeminiRetry(['key1'], 'gemini-2.5-flash', fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledWith('key1', 'gemini-2.5-flash');
  });

  it('passes modelName to the function', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await withGeminiRetry(['key1'], 'gemini-3.0-flash', fn);
    expect(fn).toHaveBeenCalledWith('key1', 'gemini-3.0-flash');
  });

  it('rotates immediately on quota error without retrying same key', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('HTTP 429 quota exceeded'))
      .mockResolvedValueOnce('success');

    const result = await withGeminiRetry(['key1', 'key2'], 'gemini-2.5-flash', fn);
    expect(result).toBe('success');
    // Should have been called exactly twice: once on key1 (failed), once on key2 (success)
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries transient errors up to 3 times on same key', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('HTTP 503 Service Unavailable'))
      .mockRejectedValueOnce(new Error('HTTP 503 Service Unavailable'))
      .mockResolvedValueOnce('success');

    const promise = withGeminiRetry(['key1'], 'gemini-2.5-flash', fn);

    // Advance timers for backoff delays
    await vi.advanceTimersByTimeAsync(2000); // attempt 1 backoff
    await vi.advanceTimersByTimeAsync(4000); // attempt 2 backoff

    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('rotates to next key after 3 transient failures', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockResolvedValueOnce('success from key2');

    const promise = withGeminiRetry(['key1', 'key2'], 'gemini-2.5-flash', fn);

    // Advance timers for backoff delays on key1
    await vi.advanceTimersByTimeAsync(2000); // attempt 1 backoff
    await vi.advanceTimersByTimeAsync(4000); // attempt 2 backoff

    const result = await promise;
    expect(result).toBe('success from key2');
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('throws "all keys exhausted" when all keys fail', async () => {
    const fn = vi.fn()
      .mockRejectedValue(new Error('HTTP 429 quota exceeded'));

    await expect(
      withGeminiRetry(['key1', 'key2'], 'gemini-2.5-flash', fn)
    ).rejects.toThrow();

    // Each key should be tried once (quota = immediate rotation)
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws non-retryable errors immediately without rotation', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Invalid API key'));

    await expect(
      withGeminiRetry(['key1', 'key2'], 'gemini-2.5-flash', fn)
    ).rejects.toThrow('Invalid API key');

    // Should only try once — non-retryable error
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses exponential backoff: 2000ms × attempt number', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('HTTP 502'))
      .mockRejectedValueOnce(new Error('HTTP 502'))
      .mockResolvedValueOnce('ok');

    const promise = withGeminiRetry(['key1'], 'gemini-2.5-flash', fn);

    // After first failure, should wait 2000ms (2000 * 1)
    await vi.advanceTimersByTimeAsync(1999);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    // Now at 2000ms, second attempt should fire
    expect(fn).toHaveBeenCalledTimes(2);

    // After second failure, should wait 4000ms (2000 * 2)
    await vi.advanceTimersByTimeAsync(3999);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(3);

    const result = await promise;
    expect(result).toBe('ok');
  });
});
