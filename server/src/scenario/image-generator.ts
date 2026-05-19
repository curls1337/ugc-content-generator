import { ScenarioClient } from './client';

/**
 * Thin wrapper around ScenarioClient.generateImage.
 * Creates a client instance and passes params for image generation.
 *
 * Defaults:
 *  - width: 1080, height: 1920 (9:16 vertical)
 *  - numOutputs: 1-4
 *  - referenceImages: 1-5 image URLs
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

  return client.generateImage({
    modelId: params.modelId,
    prompt: params.prompt,
    numOutputs: Math.min(Math.max(params.numOutputs, 1), 4),
    width: params.width ?? 1080,
    height: params.height ?? 1920,
    referenceImages: params.referenceImages?.slice(0, 5),
  });
}
