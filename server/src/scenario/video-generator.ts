import { ScenarioClient } from './client';

/**
 * Generate a video via the Scenario API.
 * If referenceImages are provided, uploads the first one as startImage for img2vid.
 * Otherwise does text-to-video generation.
 */
export async function generateVideo(params: {
  apiKey: string;
  apiSecret: string;
  modelId: string;
  prompt: string;
  duration: number;
  aspectRatio?: string;
  referenceImages?: string[];
}): Promise<{ jobId: string }> {
  const {
    apiKey,
    apiSecret,
    modelId,
    prompt,
    duration,
    aspectRatio = '9:16',
    referenceImages,
  } = params;

  const client = new ScenarioClient(apiKey, apiSecret);

  // Clamp duration to valid range (5-15 seconds)
  const clampedDuration = Math.max(5, Math.min(15, duration));

  // If reference images provided, upload first one as startImage
  let startImageAssetId: string | undefined;
  if (referenceImages && referenceImages.length > 0) {
    try {
      const imageUrl = referenceImages[0];
      const res = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
          'Referer': new URL(imageUrl).origin,
        },
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const base64 = buf.toString('base64');
        startImageAssetId = await client.uploadImage(base64, 'start-image');
      }
    } catch {
      // Failed to upload, proceed with text-to-video
    }
  }

  return client.generateVideo({
    modelId,
    prompt,
    duration: clampedDuration,
    aspectRatio,
    startImageAssetId,
  });
}
