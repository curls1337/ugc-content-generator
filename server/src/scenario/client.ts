import type { JobStatus } from '@shared/types';

/**
 * Scenario API client for image and video generation.
 * Uses Basic Auth (base64 encoded apiKey:apiSecret) for all requests.
 * Requires Node 18+ for native fetch.
 */
export class ScenarioClient {
  private readonly baseUrl = 'https://api.cloud.scenario.com';
  private readonly authHeader: string;

  constructor(apiKey: string, apiSecret: string) {
    const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  /**
   * List available Scenario models.
   * GET /v1/models with optional filters
   */
  async listModels(opts?: { privacy?: 'private' | 'public'; tags?: string; pageSize?: number }): Promise<any> {
    const query = new URLSearchParams();
    if (opts?.privacy) query.set('privacy', opts.privacy);
    if (opts?.tags) query.set('tags', opts.tags);
    query.set('pageSize', String(opts?.pageSize ?? 100));

    const response = await this.request('GET', `/v1/models?${query.toString()}`);
    return response;
  }

  /**
   * Start an image generation job.
   * POST /v1/generate/custom/{modelId}
   * 
   * For product preservation:
   * - Models with 'image' input (FLUX): use startImageAssetId + strength (0.3-0.5 preserves product)
   * - Models with 'referenceImages' input (Gemini, Seedream): use referenceImageAssetIds
   */
  async generateImage(params: {
    modelId: string;
    prompt: string;
    numOutputs: number;
    width: number;
    height: number;
    startImageAssetId?: string;
    referenceImageAssetIds?: string[];
    strength?: number;
  }): Promise<{ jobId: string }> {
    const body: Record<string, unknown> = {
      prompt: params.prompt,
      numOutputs: params.numOutputs,
      width: params.width,
      height: params.height,
    };

    // For FLUX-type models: use 'image' + 'strength' for img2img with product preservation
    if (params.startImageAssetId) {
      body.image = params.startImageAssetId;
      // Lower strength = more preservation of original image (product stays same)
      // 0.3-0.5 is ideal for keeping product but changing scene
      body.strength = params.strength ?? 0.45;
    }

    // For Gemini/Seedream-type models: use 'referenceImages' array
    if (params.referenceImageAssetIds && params.referenceImageAssetIds.length > 0) {
      body.referenceImages = params.referenceImageAssetIds;
    }

    const response = await this.request('POST', `/v1/generate/custom/${params.modelId}`, body);
    return { jobId: response.job?.id ?? response.job?.jobId ?? response.jobId ?? response.id };
  }

  /**
   * Start a video generation job.
   * POST /v1/generate/custom/{modelId}
   */
  async generateVideo(params: {
    modelId: string;
    prompt: string;
    duration: number;
    aspectRatio: string;
    startImageAssetId?: string;
  }): Promise<{ jobId: string }> {
    const body: Record<string, unknown> = {
      prompt: params.prompt,
      duration: params.duration,
      aspectRatio: params.aspectRatio,
    };

    if (params.startImageAssetId) {
      body.startImage = params.startImageAssetId;
    }

    const response = await this.request('POST', `/v1/generate/custom/${params.modelId}`, body);
    return { jobId: response.job?.id ?? response.job?.jobId ?? response.jobId ?? response.id };
  }

  /**
   * Upload an image (base64) to get an assetId.
   * POST /v1/assets
   */
  async uploadImage(base64Image: string, name?: string): Promise<string> {
    const body: Record<string, unknown> = {
      image: base64Image,
    };
    if (name) body.name = name;

    const response = await this.request('POST', '/v1/assets', body);
    return response.asset?.id ?? response.assetId ?? response.id;
  }

  /**
   * Get the status of a generation job.
   * GET /v1/jobs/{jobId}
   */
  async getJob(jobId: string): Promise<JobStatus> {
    const response = await this.request('GET', `/v1/jobs/${jobId}`);
    const job = response.job ?? response;

    // Extract asset IDs/URLs - try multiple locations in the response
    let assetIds: string[] = [];
    
    // 1. Check metadata.assetIds (most common for completed jobs)
    if (job.metadata?.assetIds?.length) {
      assetIds = job.metadata.assetIds;
    }
    // 2. Check top-level assetIds
    else if (job.assetIds?.length) {
      assetIds = job.assetIds;
    }
    // 3. Check result.images array (contains URLs or asset objects)
    else if (job.result?.images?.length) {
      assetIds = job.result.images.map((img: any) => img.assetId ?? img.id ?? img.url).filter(Boolean);
    }
    // 4. Check result.asset (single asset)
    else if (job.result?.asset) {
      assetIds = [job.result.asset.id ?? job.result.asset.url];
    }
    // 5. Check result.url directly
    else if (job.result?.url) {
      assetIds = [job.result.url];
    }

    return {
      jobId: job.id ?? job.jobId ?? jobId,
      status: job.status ?? 'queued',
      progress: job.progress ?? 0,
      assetIds,
      error: job.error ?? undefined,
      createdAt: job.createdAt ?? '',
      updatedAt: job.updatedAt ?? '',
    };
  }

  /**
   * Get asset details including download URL.
   * GET /v1/assets/{assetId}
   */
  async getAsset(assetId: string): Promise<{ url: string; type: string; mimeType: string }> {
    const response = await this.request('GET', `/v1/assets/${assetId}`);

    const asset = response.asset ?? response;
    return {
      url: asset.url ?? asset.downloadUrl ?? '',
      type: asset.type ?? 'image',
      mimeType: asset.mimeType ?? asset.contentType ?? 'image/png',
    };
  }

  /**
   * List recent assets (generated images/videos).
   * GET /v1/assets
   */
  async listAssets(params?: { pageSize?: number; type?: string }): Promise<any[]> {
    const query = new URLSearchParams();
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.type) query.set('type', params.type);
    query.set('sortBy', 'createdAt');
    query.set('sortDirection', 'desc');

    const qs = query.toString();
    const response = await this.request('GET', `/v1/assets${qs ? '?' + qs : ''}`);
    return response.assets ?? [];
  }

  /**
   * Validate the API credentials by attempting to list models.
   * Returns { valid: true } on success, or { valid: false, error } on failure.
   */
  async validate(): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.listModels();
      return { valid: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { valid: false, error: message };
    }
  }

  /**
   * Internal method to make authenticated requests to the Scenario API.
   * Throws descriptive errors with HTTP status codes on failure.
   */
  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Authorization': this.authHeader,
      'Accept': 'application/json',
    };

    const options: RequestInit = { method, headers };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown network error';
      throw new Error(`Scenario API request failed: ${message}`);
    }

    if (!response.ok) {
      let errorBody = '';
      try {
        const errorJson = await response.json();
        errorBody = errorJson.message ?? errorJson.error ?? JSON.stringify(errorJson);
      } catch {
        errorBody = await response.text().catch(() => 'Unable to read error response');
      }
      throw new Error(
        `Scenario API error (${response.status} ${response.statusText}): ${errorBody}`
      );
    }

    return response.json();
  }
}
