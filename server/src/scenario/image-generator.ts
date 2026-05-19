import { ScenarioClient } from './client';

/**
 * Generate images via the Scenario API.
 * If referenceImages are provided, uploads the first one as a start image for img2img.
 * Otherwise does text-to-image generation.
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

  // If reference images provided, upload first one for img2img
  let startImageAssetId: string | undefined;
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
        startImageAssetId = await client.uploadImage(base64, 'reference-image');
      }
    } catch {
      // Failed to upload reference image, proceed with text-to-image
    }
  }

  return client.generateImage({
    modelId: params.modelId,
    prompt: params.prompt,
    numOutputs: Math.min(Math.max(params.numOutputs, 1), 4),
    width: params.width ?? 1080,
    height: params.height ?? 1920,
    startImageAssetId,
  });
}
