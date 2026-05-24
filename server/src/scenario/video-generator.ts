import { ScenarioClient } from './client';
import type { JobStatus } from '@shared/types';

/**
 * Max duration (seconds) per video model.
 * If a model isn't listed here, defaults to 10s.
 */
const MODEL_MAX_DURATION: Record<string, number> = {
  'model_kling-v2-1': 10,
  'model_kling-v2-master': 10,
  'model_p-video': 8,
  'model_pixverse-v4': 8,
  'model_minimax-video-01': 6,
  'model_minimax-video-01-live2d': 6,
  'model_runway-gen4': 10,
  'model_luma-ray-2': 9,
  'model_luma-ray-flash-2': 5,
  'model_wan-2-1': 5,
  'model_wan-2-1-fast': 5,
  'model_veo-2': 8,
  'model_hailuo-i2v-01-live': 6,
};

const DEFAULT_MAX_DURATION = 10;

/**
 * Get the maximum duration a model supports per segment.
 */
export function getModelMaxDuration(modelId: string): number {
  // Try exact match first
  if (MODEL_MAX_DURATION[modelId]) return MODEL_MAX_DURATION[modelId];
  // Try partial match (model ID might have extra suffixes)
  for (const [key, val] of Object.entries(MODEL_MAX_DURATION)) {
    if (modelId.includes(key.replace('model_', '')) || key.includes(modelId.replace('model_', ''))) {
      return val;
    }
  }
  return DEFAULT_MAX_DURATION;
}

/**
 * Calculate how to split a requested duration into segments.
 * Returns array of segment durations that sum to the requested total.
 * Tries to make segments as equal as possible within model max.
 */
export function splitDuration(requestedDuration: number, maxPerSegment: number): number[] {
  if (requestedDuration <= maxPerSegment) {
    return [requestedDuration];
  }

  const numSegments = Math.ceil(requestedDuration / maxPerSegment);
  const baseDuration = Math.floor(requestedDuration / numSegments);
  const remainder = requestedDuration - baseDuration * numSegments;

  const segments: number[] = [];
  for (let i = 0; i < numSegments; i++) {
    // Distribute remainder across first segments
    segments.push(baseDuration + (i < remainder ? 1 : 0));
  }
  return segments;
}

/**
 * Generate a video via the Scenario API.
 * If referenceImages are provided, uploads the first one as startImage for img2vid.
 * Otherwise does text-to-video generation.
 * 
 * For durations within model max: single generation job.
 * For durations exceeding model max: returns split plan info.
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
  const maxDuration = getModelMaxDuration(modelId);

  // Clamp single segment to model max (minimum 3s)
  const clampedDuration = Math.max(3, Math.min(maxDuration, duration));

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

/**
 * Generate a long video by splitting into segments and concatenating.
 * 
 * Flow:
 * 1. Split requested duration into segments based on model max
 * 2. Generate each segment as a separate job
 * 3. Wait for all segments to complete
 * 4. Concatenate all segment assets using Scenario Video Concat API
 * 5. Return the concat job ID
 * 
 * Returns a "meta job" that tracks the overall progress.
 */
export async function generateLongVideo(params: {
  apiKey: string;
  apiSecret: string;
  modelId: string;
  prompt: string;
  duration: number;
  aspectRatio?: string;
  referenceImages?: string[];
}): Promise<{
  segments: number[];
  segmentJobIds: string[];
  totalDuration: number;
  maxPerSegment: number;
}> {
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
  const maxDuration = getModelMaxDuration(modelId);
  const segments = splitDuration(duration, maxDuration);

  // Upload reference image once (reuse for all segments)
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

  // Generate each segment
  const segmentJobIds: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segDuration = segments[i];
    const segPrompt = segments.length > 1
      ? `${prompt} [Part ${i + 1} of ${segments.length}, ${segDuration} seconds segment]`
      : prompt;

    const result = await client.generateVideo({
      modelId,
      prompt: segPrompt,
      duration: segDuration,
      aspectRatio,
      startImageAssetId,
    });
    segmentJobIds.push(result.jobId);
  }

  return {
    segments,
    segmentJobIds,
    totalDuration: duration,
    maxPerSegment: maxDuration,
  };
}

/**
 * Concatenate completed video segment assets into one video.
 * Call this after all segment jobs have completed successfully.
 */
export async function concatVideoSegments(params: {
  apiKey: string;
  apiSecret: string;
  assetIds: string[];
}): Promise<{ jobId: string }> {
  const client = new ScenarioClient(params.apiKey, params.apiSecret);
  return client.concatVideos(params.assetIds);
}

/**
 * Poll a job until it completes. Returns the final job status.
 * Used internally for waiting on segment jobs before concat.
 */
export async function waitForJob(
  client: ScenarioClient,
  jobId: string,
  timeoutMs = 300000, // 5 minutes
  pollIntervalMs = 5000
): Promise<JobStatus> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await client.getJob(jobId);
    if (job.status === 'success' || job.status === 'failed' || job.status === 'canceled') {
      return job;
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Job ${jobId} timed out after ${timeoutMs / 1000}s`);
}
