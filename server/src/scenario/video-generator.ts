import { ScenarioClient } from './client';

/**
 * Generate a video via the Scenario API.
 * Thin wrapper that creates a ScenarioClient and delegates to generateVideo.
 *
 * @param params.apiKey - Scenario API key
 * @param params.apiSecret - Scenario API secret
 * @param params.modelId - Video model ID (e.g., 'model_kling-v2-1', 'model_veo3')
 * @param params.prompt - Generation prompt text
 * @param params.duration - Video duration in seconds (5-15)
 * @param params.aspectRatio - Aspect ratio (default '9:16')
 * @param params.referenceImages - Up to 10 reference image URLs
 * @returns The job ID for polling status
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

  // Clamp duration to valid range (5-15 seconds)
  const clampedDuration = Math.max(5, Math.min(15, duration));

  // Limit reference images to 10
  const limitedImages = referenceImages?.slice(0, 10);

  const client = new ScenarioClient(apiKey, apiSecret);

  return client.generateVideo({
    modelId,
    prompt,
    duration: clampedDuration,
    aspectRatio,
    referenceImages: limitedImages,
  });
}
