import express from 'express';
import cors from 'cors';
import { scrapeProduct } from './scrapers';
import { analyzeProduct } from './llm/analyze-product';
import { generatePrompts } from './llm/prompt-generator';
import { generateImages } from './scenario/image-generator';
import { generateVideo } from './scenario/video-generator';
import { getAssetUrl } from './scenario/asset-manager';
import { ScenarioClient } from './scenario/client';
import { isValidUrl, detectPlatform } from '@shared/utils';
import type {
  ScrapeRequest,
  PromptRequest,
  ImageGenerateRequest,
  VideoGenerateRequest,
  ValidateGeminiRequest,
  ValidateScenarioRequest,
} from '@shared/api-types';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// POST /api/scrape — Scrape product data from URL
app.post('/api/scrape', async (req, res) => {
  try {
    const { url } = req.body as ScrapeRequest;

    const validation = isValidUrl(url);
    if (!validation.valid) {
      res.status(400).json({ success: false, error: validation.error });
      return;
    }

    const platform = detectPlatform(url);
    if (platform === 'unknown') {
      res.status(400).json({
        success: false,
        error: 'URL tidak dikenali. Hanya Tokopedia & Shopee yang didukung.',
      });
      return;
    }

    const data = await scrapeProduct(url);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Scraping failed' });
  }
});

// POST /api/generate/prompt — Analyze product and generate prompts
app.post('/api/generate/prompt', async (req, res) => {
  try {
    const { product, selectedImages, mode, geminiKeys, geminiModel } =
      req.body as PromptRequest;

    if (!product || !geminiKeys?.length) {
      res.status(400).json({
        success: false,
        error: 'Product data and at least one Gemini API key are required',
      });
      return;
    }

    const analysis = await analyzeProduct(product, geminiKeys, geminiModel);

    const prompts = await generatePrompts({
      product,
      analysis,
      selectedImages: selectedImages || [],
      mode: mode || 'image',
      count: 4,
      keys: geminiKeys,
      modelName: geminiModel,
    });

    res.json({ success: true, prompts, analysis });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Prompt generation failed' });
  }
});

// POST /api/generate/image — Start image generation job
app.post('/api/generate/image', async (req, res) => {
  try {
    const {
      prompt,
      referenceImages,
      modelId,
      numOutputs,
      width,
      height,
      scenarioApiKey,
      scenarioApiSecret,
    } = req.body as ImageGenerateRequest;

    if (!prompt || !modelId || !scenarioApiKey || !scenarioApiSecret) {
      res.status(400).json({
        success: false,
        error: 'Prompt, modelId, and Scenario API credentials are required',
      });
      return;
    }

    const result = await generateImages({
      apiKey: scenarioApiKey,
      apiSecret: scenarioApiSecret,
      modelId,
      prompt,
      numOutputs: numOutputs || 1,
      width,
      height,
      referenceImages,
    });

    res.json({ success: true, jobId: result.jobId });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Image generation failed' });
  }
});

// POST /api/generate/video — Start video generation job
app.post('/api/generate/video', async (req, res) => {
  try {
    const {
      prompt,
      referenceImages,
      modelId,
      duration,
      aspectRatio,
      scenarioApiKey,
      scenarioApiSecret,
    } = req.body as VideoGenerateRequest;

    if (!prompt || !modelId || !scenarioApiKey || !scenarioApiSecret) {
      res.status(400).json({
        success: false,
        error: 'Prompt, modelId, and Scenario API credentials are required',
      });
      return;
    }

    const result = await generateVideo({
      apiKey: scenarioApiKey,
      apiSecret: scenarioApiSecret,
      modelId,
      prompt,
      duration: duration || 10,
      aspectRatio: aspectRatio || '9:16',
      referenceImages,
    });

    res.json({ success: true, jobId: result.jobId });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Video generation failed' });
  }
});

// GET /api/jobs/:jobId — Poll job status
app.get('/api/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { apiKey, apiSecret } = req.query as { apiKey: string; apiSecret: string };

    if (!apiKey || !apiSecret) {
      res.status(400).json({
        success: false,
        error: 'apiKey and apiSecret query parameters are required',
      });
      return;
    }

    const client = new ScenarioClient(apiKey, apiSecret);
    const job = await client.getJob(jobId);

    res.json({ success: true, job });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch job status' });
  }
});

// GET /api/assets/:assetId — Get asset download URL
app.get('/api/assets/:assetId', async (req, res) => {
  try {
    const { assetId } = req.params;
    const { apiKey, apiSecret } = req.query as { apiKey: string; apiSecret: string };

    if (!apiKey || !apiSecret) {
      res.status(400).json({
        success: false,
        error: 'apiKey and apiSecret query parameters are required',
      });
      return;
    }

    const { url, type, mimeType } = await getAssetUrl({ apiKey, apiSecret, assetId });

    res.json({ success: true, url, type, mimeType });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch asset' });
  }
});

// POST /api/settings/validate-gemini — Validate a Gemini API key
app.post('/api/settings/validate-gemini', async (req, res) => {
  try {
    const { key } = req.body as ValidateGeminiRequest;

    if (!key || !key.trim()) {
      res.status(400).json({ valid: false, error: 'API key is required' });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key.trim())}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (response.ok) {
        res.json({ valid: true });
      } else {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorBody = await response.json();
          errorMessage = errorBody.error?.message || errorMessage;
        } catch {
          // Use status code as error message
        }
        res.json({ valid: false, error: errorMessage });
      }
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        res.json({ valid: false, error: 'Validation timed out (10s)' });
      } else {
        res.json({ valid: false, error: err.message || 'Network error' });
      }
    }
  } catch (err: any) {
    res.status(500).json({ valid: false, error: err.message || 'Validation failed' });
  }
});

// POST /api/settings/validate-scenario — Validate Scenario API credentials
app.post('/api/settings/validate-scenario', async (req, res) => {
  try {
    const { apiKey, apiSecret } = req.body as ValidateScenarioRequest;

    if (!apiKey || !apiKey.trim() || !apiSecret || !apiSecret.trim()) {
      res.status(400).json({ valid: false, error: 'API key and secret are required' });
      return;
    }

    const client = new ScenarioClient(apiKey.trim(), apiSecret.trim());
    const result = await client.validate();

    res.json(result);
  } catch (err: any) {
    res.json({ valid: false, error: err.message || 'Validation failed' });
  }
});

// GET /api/models — List available Scenario models
app.get('/api/models', async (req, res) => {
  try {
    const { apiKey, apiSecret } = req.query as { apiKey: string; apiSecret: string };

    if (!apiKey || !apiSecret) {
      res.status(400).json({
        success: false,
        error: 'apiKey and apiSecret query parameters are required',
      });
      return;
    }

    const client = new ScenarioClient(apiKey, apiSecret);
    const models = await client.listModels();

    res.json({ success: true, models });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch models' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
