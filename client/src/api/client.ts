import type {
  ScrapeResponse,
  PromptRequest,
  PromptResponse,
  ImageGenerateRequest,
  VideoGenerateRequest,
  GenerateResponse,
  JobPollResponse,
  AssetResponse,
  ValidateResponse,
} from '@shared/api-types';

const API_BASE = ''; // Uses Vite proxy (already configured in vite.config.ts)

/**
 * Scrape product data from a Tokopedia or Shopee URL.
 */
export async function scrapeProduct(url: string): Promise<ScrapeResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data: ScrapeResponse = await response.json();
    if (!response.ok && !data.error) {
      return { success: false, error: `Server error: ${response.status}` };
    }
    return data;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? `Network error: ${err.message}` : 'An unexpected network error occurred.',
    };
  }
}

/**
 * Generate creative prompts via Gemini AI.
 */
export async function generatePrompts(params: PromptRequest): Promise<PromptResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/generate/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data: PromptResponse = await response.json();
    if (!response.ok && !data.error) {
      return { success: false, error: `Server error: ${response.status}` };
    }
    return data;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? `Network error: ${err.message}` : 'An unexpected network error occurred.',
    };
  }
}

/**
 * Start image generation via Scenario API.
 */
export async function generateImage(params: ImageGenerateRequest): Promise<GenerateResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/generate/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data: GenerateResponse = await response.json();
    if (!response.ok && !data.error) {
      return { success: false, error: `Server error: ${response.status}` };
    }
    return data;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? `Network error: ${err.message}` : 'An unexpected network error occurred.',
    };
  }
}

/**
 * Start video generation via Scenario API.
 */
export async function generateVideo(params: VideoGenerateRequest): Promise<GenerateResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/generate/video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data: GenerateResponse = await response.json();
    if (!response.ok && !data.error) {
      return { success: false, error: `Server error: ${response.status}` };
    }
    return data;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? `Network error: ${err.message}` : 'An unexpected network error occurred.',
    };
  }
}

/**
 * Poll a Scenario generation job for status updates.
 */
export async function pollJob(jobId: string, apiKey: string, apiSecret: string): Promise<JobPollResponse> {
  try {
    const params = new URLSearchParams({ apiKey, apiSecret });
    const response = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}?${params.toString()}`);
    const data: JobPollResponse = await response.json();
    if (!response.ok && !data.error) {
      return { success: false, error: `Server error: ${response.status}` };
    }
    return data;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? `Network error: ${err.message}` : 'An unexpected network error occurred.',
    };
  }
}

/**
 * Get asset download URL from Scenario.
 */
export async function getAsset(assetId: string, apiKey: string, apiSecret: string): Promise<AssetResponse> {
  try {
    const params = new URLSearchParams({ apiKey, apiSecret });
    const response = await fetch(`${API_BASE}/api/assets/${encodeURIComponent(assetId)}?${params.toString()}`);
    const data: AssetResponse = await response.json();
    if (!response.ok && !data.error) {
      return { success: false, error: `Server error: ${response.status}` };
    }
    return data;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? `Network error: ${err.message}` : 'An unexpected network error occurred.',
    };
  }
}

/**
 * Validate a Gemini API key.
 */
export async function validateGeminiKey(key: string): Promise<ValidateResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/settings/validate-gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const data: ValidateResponse = await response.json();
    if (!response.ok && data.valid === undefined) {
      return { valid: false, error: `Server error: ${response.status}` };
    }
    return data;
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? `Network error: ${err.message}` : 'An unexpected network error occurred.',
    };
  }
}

/**
 * Validate Scenario API credentials.
 */
export async function validateScenarioKey(apiKey: string, apiSecret: string): Promise<ValidateResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/settings/validate-scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, apiSecret }),
    });
    const data: ValidateResponse = await response.json();
    if (!response.ok && data.valid === undefined) {
      return { valid: false, error: `Server error: ${response.status}` };
    }
    return data;
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? `Network error: ${err.message}` : 'An unexpected network error occurred.',
    };
  }
}

/**
 * List available Scenario models.
 */
export async function listModels(apiKey: string, apiSecret: string): Promise<any> {
  try {
    const params = new URLSearchParams({ apiKey, apiSecret });
    const response = await fetch(`${API_BASE}/api/models?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: `Server error: ${response.status}` };
    }
    return data;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? `Network error: ${err.message}` : 'An unexpected network error occurred.',
    };
  }
}

/**
 * List recent generated assets from Scenario.
 */
export async function listGeneratedAssets(apiKey: string, apiSecret: string, pageSize?: number): Promise<{ success: boolean; assets?: any[]; error?: string }> {
  try {
    const params = new URLSearchParams({ apiKey, apiSecret });
    if (pageSize) params.set('pageSize', String(pageSize));
    const response = await fetch(`${API_BASE}/api/assets?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: `Server error: ${response.status}` };
    }
    return data;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? `Network error: ${err.message}` : 'An unexpected network error occurred.',
    };
  }
}
