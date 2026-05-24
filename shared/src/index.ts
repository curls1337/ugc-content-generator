// Shared types and utilities barrel export
export type {
  Platform,
  ProductData,
  ProductAnalysis,
  GenerationPrompt,
  JobStatus,
  GeneratedContent,
  GenerationSession,
  ApiKeyEntry,
  GeminiModelChoice,
} from './types';

export type {
  ScrapeRequest,
  ScrapeResponse,
  PromptRequest,
  PromptResponse,
  ImageGenerateRequest,
  VideoGenerateRequest,
  LongVideoGenerateRequest,
  LongVideoGenerateResponse,
  VideoConcatRequest,
  GenerateResponse,
  JobPollResponse,
  AssetResponse,
  ValidateGeminiRequest,
  ValidateScenarioRequest,
  ValidateResponse,
} from './api-types';

// Utils
export { isValidUrl, detectPlatform } from './utils';
export type { UrlValidationResult } from './utils';
export {
  formatShopeePrice,
  formatRating,
  truncatePrompt,
} from './utils';
export { parseApiKeys } from './utils';
export { sortSessionsDescending } from './utils';
