import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Gemini client utilities.
 *
 * - Client cache to reuse GoogleGenerativeAI instances per key
 * - Base64 image fetching for multimodal prompts
 * - Safe JSON parsing with markdown fence stripping and regex fallback
 */

const clientCache = new Map<string, GoogleGenerativeAI>();

/**
 * Returns a cached or new GoogleGenerativeAI client for the given API key.
 */
export function getGeminiByKey(key: string): GoogleGenerativeAI {
  let client = clientCache.get(key);
  if (!client) {
    client = new GoogleGenerativeAI(key);
    clientCache.set(key, client);
  }
  return client;
}

/**
 * Fetches an image from a URL and returns its base64-encoded data and MIME type.
 */
export async function fetchImageAsBase64(
  url: string
): Promise<{ data: string; mime: string }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
      Referer: new URL(url).origin,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch image: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const mime =
    res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  return { data: buf.toString("base64"), mime };
}

/**
 * Safely parses a JSON string that may be wrapped in markdown code fences.
 * Falls back to regex extraction of the first {...} or [...] block.
 * Returns null if parsing fails entirely.
 */
export function safeParseJson<T = any>(s: string): T | null {
  // Strip markdown fences if present
  const cleaned = s
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/g, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to extract first JSON object or array block
    const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        // Fall through to return null
      }
    }
    return null;
  }
}
