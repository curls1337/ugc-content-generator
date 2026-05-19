import type { JobStatus } from '../../shared/src/types';

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
   * GET /v1/models
   */
  async listModels(): Promise<any> {
    const response = await this.request('GET', '/v1/models');
    return response;
  }

  /**
   * Start an image generation job.
   * POST /v1/generate
   */
  async generateImage(params: {
    modelId: string;
    prompt: string;
    numOutputs: number;
    width: number;
    height: number;
    referenceImages?: string[];
  }): Promise<{ jobId: string }> {
    const body: Record<string, unknown> = {
      modelId: params.modelId,
      prompt: params.prompt,
      numOutputs: params.numOutputs,
      width: params.width,
      height: params.height,
      type: 'image',
    };

    if (params.referenceImages && params.referenceImages.length > 0) {
      body.referenceImages = params.referenceImages;
    }

    const response = await this.request('POST', '/v1/generate', body);
    return { jobId: response.jobId ?? response.job?.jobId ?? response.id };
  }

  /**
   * Start a video generation job.
   * POST /v1/generate
   */
  async generateVideo(params: {
    modelId: string;
    prompt: string;
    duration: number;
    aspectRatio: string;
    referenceImages?: string[];
  }): Promise<{ jobId: string }> {
    const body: Record<string, unknown> = {
      modelId: params.modelId,
      prompt: params.prompt,
      duration: params.duration,
      aspectRatio: params.aspectRatio,
      type: 'video',
    };

    if (params.referenceImages && params.referenceImages.length > 0) {
      body.referenceImages = params.referenceImages;
    }

    const response = await this.request('POST', '/v1/generate', body);
    return { jobId: response.jobId ?? response.job?.jobId ?? response.id };
  }

  /**
   * Get the status of a generation job.
   * GET /v1/jobs/{jobId}
   */
  async getJob(jobId: string): Promise<JobStatus> {
    const response = await this.request('GET', `/v1/jobs/${jobId}`);

    return {
      jobId: response.job?.jobId ?? response.jobId ?? jobId,
      status: response.job?.status ?? response.status ?? 'queued',
      progress: response.job?.progress ?? response.progress ?? 0,
      assetIds: response.job?.assetIds ?? response.assetIds ?? [],
      error: response.job?.error ?? response.error,
      createdAt: response.job?.createdAt ?? response.createdAt ?? '',
      updatedAt: response.job?.updatedAt ?? response.updatedAt ?? '',
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
