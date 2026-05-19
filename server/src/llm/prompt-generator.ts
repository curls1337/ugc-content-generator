import type { ProductData, ProductAnalysis } from "../../shared/src/types";
import { getGeminiByKey, fetchImageAsBase64, safeParseJson } from "./gemini";
import { withGeminiRetry } from "../utils/key-rotator";

/**
 * JSON schema for structured Gemini output.
 * Expects an object with a "prompts" array of strings.
 */
const PROMPTS_SCHEMA = {
  type: "object",
  properties: {
    prompts: { type: "array", items: { type: "string" } },
  },
  required: ["prompts"],
};

/** Maximum allowed length for a single prompt */
const MAX_PROMPT_LENGTH = 1200;

/** Minimum allowed length for a single prompt */
const MIN_PROMPT_LENGTH = 100;

/**
 * Generates fallback prompts when Gemini returns unparseable JSON or empty prompts.
 * Uses product data (visualNotes, tone, title) to construct basic prompts.
 */
function generateFallbackPrompts(
  product: ProductData,
  analysis: ProductAnalysis,
  mode: "image" | "video",
  count: number
): string[] {
  const modeLabel = mode === "video" ? "video" : "photo";
  return Array.from({ length: count }, (_, i) => {
    return `UGC ${modeLabel}, vertical 9:16 format. ${analysis.visualNotes}. ${analysis.tone} mood, authentic feel, Indonesian setting. Variant ${i + 1}, showcasing ${product.title.slice(0, 80)}. Natural lighting, candid composition, no text overlays.`;
  });
}

/**
 * Builds the prompt text instructing Gemini to generate creative UGC prompts.
 */
function buildPromptText(
  product: ProductData,
  analysis: ProductAnalysis,
  mode: "image" | "video",
  count: number
): string {
  const modeLabel = mode === "video" ? "video" : "image";
  return `Create ${count} distinct UGC ${modeLabel} prompts in English for an AI ${modeLabel} generator.
Each prompt must be 150-500 characters, max ${MAX_PROMPT_LENGTH} chars total per prompt.

PRODUCT CONTEXT:
- Title: ${product.title}
- Description: ${(product.description || "").slice(0, 800)}
- Category: ${analysis.category}
- Target audience: ${analysis.targetAudience}
- Key benefits: ${analysis.keyBenefits.join(", ")}
- Visual notes: ${analysis.visualNotes}
- Tone: ${analysis.tone}

GUIDELINES:
- UGC style: authentic, relatable, user-generated feel — NOT polished studio content
- Format: vertical 9:16 (TikTok/Reels/Shorts) — compose shot accordingly
- Indonesian context: feature Indonesian people, everyday Indonesian settings (home, cafe, street market, campus, warung)
- Do NOT include text overlays, captions, or watermarks in the ${modeLabel}
- Vary camera angles across variants: close-up, medium shot, over-the-shoulder, POV, low angle
- Vary mood and lighting: golden hour, soft indoor light, bright daylight, moody evening
- Describe the product visually by type/color/shape — avoid using the full brand name
- Each prompt should feel like a different creator's take on the product
- Output JSON: {"prompts": ["...", "..."]}`;
}

/**
 * Generates creative UGC prompts for image or video generation using Gemini AI.
 *
 * Sends product data + first selected image (base64) to Gemini for multimodal context.
 * Uses structured JSON output and key rotation for reliability.
 * Falls back to product-data-based prompts if Gemini response is unparseable or empty.
 *
 * @param params - Generation parameters
 * @returns Array of prompt strings (100-1200 characters each)
 */
export async function generatePrompts(params: {
  product: ProductData;
  analysis: ProductAnalysis;
  selectedImages: string[];
  mode: "image" | "video";
  count: number;
  keys: string[];
  modelName: string;
}): Promise<string[]> {
  const { product, analysis, selectedImages, mode, count, keys, modelName } =
    params;

  const promptText = buildPromptText(product, analysis, mode, count);

  // Build multimodal parts: text prompt + first selected image
  const parts: any[] = [{ text: promptText }];

  const imgUrl = selectedImages[0];
  if (imgUrl) {
    try {
      const { data, mime } = await fetchImageAsBase64(imgUrl);
      parts.push({ inlineData: { data, mimeType: mime } });
    } catch {
      // Image fetch failed — continue with text-only prompt generation
    }
  }

  try {
    const text = await withGeminiRetry(
      keys,
      modelName,
      async (apiKey, model) => {
        const genModel = getGeminiByKey(apiKey).getGenerativeModel({
          model,
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: PROMPTS_SCHEMA as any,
            temperature: 0.9,
          },
        });
        const result = await genModel.generateContent(parts);
        return result.response.text();
      }
    );

    const parsed = safeParseJson<{ prompts: string[] }>(text);

    if (!parsed?.prompts?.length) {
      // Gemini returned unparseable JSON or empty prompts — use fallback
      return generateFallbackPrompts(product, analysis, mode, count);
    }

    // Truncate each prompt to max 1200 characters, filter out short ones
    const processed = parsed.prompts
      .slice(0, count)
      .map((p) => p.slice(0, MAX_PROMPT_LENGTH))
      .filter((p) => p.length >= MIN_PROMPT_LENGTH);

    // If all prompts were filtered out, use fallback
    if (processed.length === 0) {
      return generateFallbackPrompts(product, analysis, mode, count);
    }

    return processed;
  } catch (err: any) {
    // All keys exhausted or non-retryable error — rethrow for the route handler
    throw err;
  }
}
