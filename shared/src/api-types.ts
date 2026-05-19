import type {
  GeminiModelChoice,
  JobStatus,
  ProductAnalysis,
  ProductData,
} from './types';

// POST /api/scrape
export interface ScrapeRequest {
  url: string;
}

export interface ScrapeResponse {
  success: boolean;
  data?: ProductData;
  error?: string;
}

// POST /api/generate/prompt
export interface PromptRequest {
  product: ProductData;
  selectedImages: string[]; // URLs of selected images
  mode: 'image' | 'video';
  geminiKeys: string[]; // Valid keys from client
  geminiModel: GeminiModelChoice;
}

export interface PromptResponse {
  success: boolean;
  prompts?: string[];
  analysis?: ProductAnalysis;
  error?: string;
}

// POST /api/generate/image
export interface ImageGenerateRequest {
  prompt: string;
  referenceImages: string[]; // URLs to upload as references
  modelId: string; // e.g., 'model_bfl-flux-2-dev'
  numOutputs: number; // 1-4
  width: number; // 1080
  height: number; // 1920
  scenarioApiKey: string;
  scenarioApiSecret: string;
}

// POST /api/generate/video
export interface VideoGenerateRequest {
  prompt: string;
  referenceImages: string[];
  modelId: string; // e.g., 'model_kling-v2-1'
  duration: number; // 5-15 seconds
  aspectRatio: '9:16';
  scenarioApiKey: string;
  scenarioApiSecret: string;
}

// Shared response for image and video generation
export interface GenerateResponse {
  success: boolean;
  jobId?: string;
  error?: string;
}

// GET /api/jobs/:jobId
export interface JobPollResponse {
  success: boolean;
  job?: JobStatus;
  error?: string;
}

// GET /api/assets/:assetId
export interface AssetResponse {
  success: boolean;
  url?: string;
  type?: 'image' | 'video';
  mimeType?: string;
  error?: string;
}

// POST /api/settings/validate-gemini
export interface ValidateGeminiRequest {
  key: string;
}

// POST /api/settings/validate-scenario
export interface ValidateScenarioRequest {
  apiKey: string;
  apiSecret: string;
}

// Shared validation response
export interface ValidateResponse {
  valid: boolean;
  error?: string;
}
