// Platform identification
export type Platform = 'tokopedia' | 'shopee' | 'unknown';

// Scraped product data
export interface ProductData {
  platform: Platform;
  url: string;
  title: string;
  description: string;
  price?: string;
  rating?: string;
  images: string[];
  scrapedAt: number;
}

// Product analysis from Gemini
export interface ProductAnalysis {
  category: string;
  targetAudience: string;
  keyBenefits: string[];
  tone: 'energetic' | 'calm' | 'luxurious' | 'playful';
  visualNotes: string;
}

// Generation prompt structure
export interface GenerationPrompt {
  text: string; // 100-1200 characters
  mode: 'image' | 'video';
  aspectRatio: '9:16';
  referenceImageIds: string[];
}

// Scenario job status
export interface JobStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'success' | 'failed' | 'canceled';
  progress: number; // 0-1
  assetIds: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// Generated content item
export interface GeneratedContent {
  id: string;
  assetId: string;
  type: 'image' | 'video';
  url: string;
  prompt: string;
  width: number;
  height: number;
  duration?: number; // seconds, for video
  createdAt: number;
}

// Generation session (groups content by generation run)
export interface GenerationSession {
  id: string;
  productTitle: string;
  mode: 'image' | 'video';
  items: GeneratedContent[];
  createdAt: number;
}

// API key management
export interface ApiKeyEntry {
  key: string;
  valid: boolean;
  lastChecked: number;
  lastError?: string;
}

// Gemini model selection
export type GeminiModelChoice = 'gemini-2.5-flash' | 'gemini-3.0-flash';
