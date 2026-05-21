import type { ProductData, ProductAnalysis } from "@shared/types";
import { getGeminiByKey, fetchImageAsBase64, safeParseJson } from "./gemini";
import { withGeminiRetry } from "../utils/key-rotator";

const PROMPTS_SCHEMA = {
  type: "object",
  properties: {
    prompts: { type: "array", items: { type: "string" } },
  },
  required: ["prompts"],
};

const MAX_PROMPT_LENGTH = 1200;
const MIN_PROMPT_LENGTH = 100;

function generateFallbackPrompts(
  product: ProductData,
  analysis: ProductAnalysis,
  mode: "image" | "video",
  count: number,
  hasCharacter: boolean
): string[] {
  const modeLabel = mode === "video" ? "video" : "photo";
  const characterPart = hasCharacter ? "The character holds the product naturally" : "";
  return Array.from({ length: count }, (_, i) => {
    return `${modeLabel.charAt(0).toUpperCase() + modeLabel.slice(1)} of "${product.title}" — preserve EXACT product appearance: same color, shape, label, text, and design as in the reference image. ${characterPart}. Setting: ${analysis.visualNotes}. ${analysis.tone} mood, vertical 9:16 UGC format, Indonesian context. Natural lighting, authentic feel. Variant ${i + 1}.`;
  });
}

function buildPromptText(
  product: ProductData,
  analysis: ProductAnalysis,
  mode: "image" | "video",
  count: number,
  hasCharacter: boolean
): string {
  const modeLabel = mode === "video" ? "video" : "image";
  const productName = product.title;

  const characterSection = hasCharacter
    ? `\nCHARACTER (uploaded reference image #2):
- Use the uploaded character/person as the talent in every prompt
- Describe their appearance briefly (gender, approximate age, hair, outfit) so the AI can preserve them
- Have the character interact with the product naturally (holding, using, displaying)
`
    : `\nTALENT:
- Indonesian person matching the target audience: ${analysis.targetAudience}
`;

  return `Create ${count} distinct UGC ${modeLabel} generation prompts in English.
Each prompt must be 150-700 characters, max ${MAX_PROMPT_LENGTH} chars per prompt.

CRITICAL RULES — PRODUCT PRESERVATION:
- The product MUST appear EXACTLY as shown in reference image #1
- DO NOT change the product's: color, shape, packaging, label text, brand name, design, or proportions
- The product is: "${productName}"
- Always describe the product as "the exact product shown in the reference image" or use phrasing like "preserve product details from reference"
- The goal is to place the product in different scenes/contexts WITHOUT modifying its appearance

PRODUCT CONTEXT:
- Product name: ${productName}
- Description: ${(product.description || "").slice(0, 600)}
- Category: ${analysis.category}
- Visual notes: ${analysis.visualNotes}
- Target audience: ${analysis.targetAudience}
- Tone: ${analysis.tone}
${characterSection}
GUIDELINES:
- Format: vertical 9:16 (TikTok/Reels/Shorts)
- UGC style: authentic, relatable, user-generated feel — NOT polished studio content
- Indonesian context: home, cafe, street market, campus, mall, warung, kos, kantor
- Do NOT include text overlays, captions, or watermarks in the output
- Vary across variants: camera angle (close-up, medium, POV, over-the-shoulder), mood, lighting (golden hour, soft indoor, bright daylight, moody evening)
- Each prompt should describe a DIFFERENT scene/scenario but with the SAME product appearance
- For ${modeLabel === "video" ? "video: describe motion (camera movement, character actions, gestures)" : "image: describe a single moment/composition"}

OUTPUT JSON: {"prompts": ["prompt1", "prompt2", ...]}`;
}

/**
 * Generates UGC prompts that preserve product appearance and optionally include a character.
 *
 * @param params - includes optional hasCharacter flag for character-aware prompts
 */
export async function generatePrompts(params: {
  product: ProductData;
  analysis: ProductAnalysis;
  selectedImages: string[];
  mode: "image" | "video";
  count: number;
  keys: string[];
  modelName: string;
  hasCharacter?: boolean;
  characterImageBase64?: string;
  characterImageMime?: string;
}): Promise<string[]> {
  const { product, analysis, selectedImages, mode, count, keys, modelName, hasCharacter, characterImageBase64, characterImageMime } = params;

  const promptText = buildPromptText(product, analysis, mode, count, !!hasCharacter);

  // Build multimodal parts: text + product image (#1) + character image (#2 if provided)
  const parts: any[] = [{ text: promptText }];

  // Add product reference image
  const imgUrl = selectedImages[0];
  if (imgUrl) {
    try {
      const { data, mime } = await fetchImageAsBase64(imgUrl);
      parts.push({ text: "Reference image #1 (PRODUCT - preserve exactly):" });
      parts.push({ inlineData: { data, mimeType: mime } });
    } catch {
      // Continue without product image
    }
  }

  // Add character image if provided
  if (hasCharacter && characterImageBase64 && characterImageMime) {
    parts.push({ text: "Reference image #2 (CHARACTER/TALENT - use as the person):" });
    parts.push({ inlineData: { data: characterImageBase64, mimeType: characterImageMime } });
  }

  try {
    const text = await withGeminiRetry(keys, modelName, async (apiKey, model) => {
      const genModel = getGeminiByKey(apiKey).getGenerativeModel({
        model,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: PROMPTS_SCHEMA as any,
          temperature: 0.85,
        },
      });
      const result = await genModel.generateContent(parts);
      return result.response.text();
    });

    const parsed = safeParseJson<{ prompts: string[] }>(text);

    if (!parsed?.prompts?.length) {
      return generateFallbackPrompts(product, analysis, mode, count, !!hasCharacter);
    }

    const processed = parsed.prompts
      .slice(0, count)
      .map((p) => p.slice(0, MAX_PROMPT_LENGTH))
      .filter((p) => p.length >= MIN_PROMPT_LENGTH);

    if (processed.length === 0) {
      return generateFallbackPrompts(product, analysis, mode, count, !!hasCharacter);
    }

    return processed;
  } catch (err: any) {
    throw err;
  }
}
