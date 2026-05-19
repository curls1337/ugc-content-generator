import type { ProductData, ProductAnalysis } from "../../shared/src/types";
import { getGeminiByKey, fetchImageAsBase64, safeParseJson } from "./gemini";
import { withGeminiRetry } from "../utils/key-rotator";

/**
 * JSON schema for structured Gemini output.
 * Matches the ProductAnalysis interface from shared types.
 */
const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string" },
    targetAudience: { type: "string" },
    keyBenefits: { type: "array", items: { type: "string" } },
    tone: {
      type: "string",
      enum: ["energetic", "calm", "luxurious", "playful"],
    },
    visualNotes: { type: "string" },
  },
  required: ["category", "targetAudience", "keyBenefits", "tone", "visualNotes"],
};

/** Default fallback analysis when Gemini parsing fails */
function getDefaultAnalysis(product: ProductData): ProductAnalysis {
  return {
    category: "General",
    targetAudience: "Online shoppers",
    keyBenefits: [product.title],
    tone: "energetic",
    visualNotes: `Product: ${product.title}. ${product.description?.slice(0, 200) || ""}`,
  };
}

/**
 * Analyzes product data using Gemini to extract marketing-relevant insights.
 *
 * Uses structured JSON output (responseMimeType: "application/json") for reliable parsing.
 * Falls back to reasonable defaults if Gemini response cannot be parsed.
 *
 * @param product - The scraped product data
 * @param keys - Array of valid Gemini API keys for rotation
 * @param modelName - The Gemini model to use (e.g., "gemini-2.5-flash")
 * @returns ProductAnalysis with category, targetAudience, keyBenefits, tone, visualNotes
 */
export async function analyzeProduct(
  product: ProductData,
  keys: string[],
  modelName: string
): Promise<ProductAnalysis> {
  const parts: any[] = [
    {
      text: `You are an experienced marketing strategist and UGC content creator.
Analyze the following e-commerce product (data + main image) for creating UGC content for TikTok/Reels.
Output MUST be valid JSON matching the schema.

PRODUCT DATA:
- Platform: ${product.platform}
- Title: ${product.title}
- Price: ${product.price || "-"}
- Rating: ${product.rating || "-"}
- Description: ${(product.description || "").slice(0, 1500)}

GUIDELINES:
- category: product category (e.g., "Beauty", "Electronics", "Fashion")
- targetAudience: primary target audience description
- keyBenefits: 3-5 key benefits for the user (not technical specs, but value propositions)
- tone: choose the most fitting brand voice for this product (energetic, calm, luxurious, or playful)
- visualNotes: visual description of the product for AI video/image prompts (colors, shape, interesting details)`,
    },
  ];

  // Try to include the first product image for multimodal analysis
  const imgUrl = product.images[0];
  if (imgUrl) {
    try {
      const { data, mime } = await fetchImageAsBase64(imgUrl);
      parts.push({ inlineData: { data, mimeType: mime } });
    } catch {
      // Image fetch failed — continue with text-only analysis
    }
  }

  try {
    const text = await withGeminiRetry(keys, modelName, async (apiKey, model) => {
      const genModel = getGeminiByKey(apiKey).getGenerativeModel({
        model,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: ANALYSIS_SCHEMA as any,
          temperature: 0.7,
        },
      });
      const result = await genModel.generateContent(parts);
      return result.response.text();
    });

    const parsed = safeParseJson<ProductAnalysis>(text);
    if (parsed && parsed.category && parsed.keyBenefits) {
      return parsed;
    }

    // Parsing succeeded but result is incomplete — use defaults
    console.warn("[analyze-product] Incomplete analysis from Gemini, using defaults");
    return getDefaultAnalysis(product);
  } catch (err: any) {
    console.warn(
      `[analyze-product] Gemini analysis failed: ${String(err?.message || err).slice(0, 150)}. Using defaults.`
    );
    return getDefaultAnalysis(product);
  }
}
