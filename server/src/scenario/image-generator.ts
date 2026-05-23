import { ScenarioClient } from './client';

// Models that use 'image' + 'strength' for img2img (FLUX-type)
const IMG2IMG_MODELS = ['model_bfl-flux-1-dev', 'model_bfl-flux-1-schnell', 'model_bfl-flux-2-dev'];

// Models that use 'referenceImages' array (Gemini, Seedream, etc.)
const REFERENCE_MODELS = ['model_google-gemini-pro-image-editing', 'model_google-gemini-3-1-flash', 'model_bytedance-seedream-4-5-editing', 'model_sourceful-riverflow-2-0-fast'];

/**
 * Generate images via the Scenario API with product preservation.
 * 
 * Strategy for product consistency:
 * - FLUX models: upload product image as 'image' param with low strength (0.4) 
 *   → AI changes scene/background but preserves product appearance
 * - Gemini/Seedream models: upload as 'referenceImages' 
 *   → AI uses product as visual reference
 * - Other models: upload as 'image' (generic img2img)
 */
export async function generateImages(params: {
  apiKey: string;
  apiSecret: string;
  modelId: string;
  prompt: string;
  numOutputs: number;
  width?: number;
  height?: number;
  referenceImages?: string[];
}): Promise<{ jobId: string }> {
  const client = new ScenarioClient(params.apiKey, params.apiSecret);

  let startImageAssetId: string | undefined;
  let referenceImageAssetIds: string[] = [];

  // Upload reference image(s) if provided
  if (params.referenceImages && params.referenceImages.length > 0) {
    try {
      const imageUrl = params.referenceImages[0];
      const res = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
          'Referer': new URL(imageUrl).origin,
        },
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const base64 = buf.toString('base64');
        const assetId = await client.uploadImage(base64, 'product-reference');
        
        if (REFERENCE_MODELS.some(m => params.modelId.includes(m.replace('model_', '')))) {
          // For Gemini/Seedream: use as referenceImages
          referenceImageAssetIds = [assetId];
        } else {
          // For FLUX and others: use as img2img start image
          startImageAssetId = assetId;
        }
      }
    } catch {
      // Failed to upload, proceed with text-to-image
    }
  }

  // Determine strength based on model type
  const isFluxModel = IMG2IMG_MODELS.some(m => params.modelId.includes(m.replace('model_', '')));
  const strength = isFluxModel ? 0.4 : 0.5; // Lower = more preservation

  return client.generateImage({
    modelId: params.modelId,
    prompt: params.prompt,
    numOutputs: Math.min(Math.max(params.numOutputs, 1), 4),
    width: params.width ?? 1080,
    height: params.height ?? 1920,
    startImageAssetId,
    referenceImageAssetIds: referenceImageAssetIds.length > 0 ? referenceImageAssetIds : undefined,
    strength: startImageAssetId ? strength : undefined,
  });
}
