import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeProduct } from './scrapers';
import { analyzeProduct } from './llm/analyze-product';
import { generatePrompts } from './llm/prompt-generator';
import { generateImages } from './scenario/image-generator';
import { generateVideo } from './scenario/video-generator';
import { getAssetUrl } from './scenario/asset-manager';
import { ScenarioClient } from './scenario/client';
import { isValidUrl, detectPlatform } from '@shared/utils/index';
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
    const { product, selectedImages, mode, geminiKeys, geminiModel, characterImageBase64, characterImageMime } =
      req.body as PromptRequest & { characterImageBase64?: string; characterImageMime?: string };

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
      hasCharacter: !!characterImageBase64,
      characterImageBase64,
      characterImageMime,
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

// GET /api/assets — List recent generated assets
app.get('/api/assets', async (req, res) => {
  try {
    const { apiKey, apiSecret, pageSize, type } = req.query as { apiKey: string; apiSecret: string; pageSize?: string; type?: string };

    if (!apiKey || !apiSecret) {
      res.status(400).json({
        success: false,
        error: 'apiKey and apiSecret query parameters are required',
      });
      return;
    }

    const client = new ScenarioClient(apiKey, apiSecret);
    const assets = await client.listAssets({ 
      pageSize: pageSize ? parseInt(pageSize) : 20,
      type: type || undefined 
    });

    res.json({ success: true, assets });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to list assets' });
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
    
    // Base models with verified IDs and access levels
    // access: 0=Free, 25=Creator, 50=Pro, 75=Team, 100=Enterprise
    const baseModels = [
      // IMAGE MODELS (sorted by access level)
      { id: 'model_imagen4-ultra', name: 'Imagen 4 Ultra (Google)', capabilities: ['txt2img'], type: 'base', access: 0 },
      { id: 'model_recraft-v3', name: 'Recraft 3', capabilities: ['txt2img'], type: 'base', access: 0 },
      { id: 'model_bfl-flux-1-1-pro', name: 'FLUX 1.1 Pro', capabilities: ['txt2img'], type: 'base', access: 0 },
      { id: 'model_bfl-flux-1-1-pro-ultra', name: 'FLUX 1.1 Pro Ultra', capabilities: ['txt2img'], type: 'base', access: 0 },
      { id: 'model_bfl-flux-1-dev', name: 'FLUX 1 Dev', capabilities: ['txt2img', 'img2img'], type: 'base', access: 0 },
      { id: 'model_bfl-flux-1-schnell', name: 'FLUX 1 Schnell', capabilities: ['txt2img', 'img2img'], type: 'base', access: 0 },
      { id: 'model_imagen3', name: 'Imagen 3', capabilities: ['txt2img'], type: 'base', access: 0 },
      { id: 'model_imagen3-fast', name: 'Imagen 3 Fast', capabilities: ['txt2img'], type: 'base', access: 0 },
      { id: 'model_luma-photon-flash', name: 'Luma Photon Flash', capabilities: ['txt2img'], type: 'base', access: 0 },
      { id: 'model_p-image', name: 'P-Image', capabilities: ['txt2img'], type: 'base', access: 0 },
      { id: 'model_sourceful-riverflow-2-0-fast', name: 'Riverflow 2.0 Fast', capabilities: ['txt2img', 'img2img'], type: 'base', access: 0 },
      { id: 'model_google-gemini-pro-image-editing', name: 'Gemini 3.0 Pro', capabilities: ['txt2img', 'img2img'], type: 'base', access: 0 },
      { id: 'model_google-gemini-3-1-flash', name: 'Gemini 3.1 Flash', capabilities: ['txt2img', 'img2img'], type: 'base', access: 0 },
      { id: 'model_bytedance-seedream-4-5-editing', name: 'Seedream 4.5', capabilities: ['txt2img', 'img2img'], type: 'base', access: 0 },
      { id: 'model_bfl-flux-2-dev', name: 'FLUX 2 Dev', capabilities: ['txt2img', 'img2img'], type: 'base', access: 25 },
      { id: 'model_luma-photon', name: 'Luma Photon', capabilities: ['txt2img'], type: 'base', access: 25 },
      { id: 'model_xai-grok-imagine-image', name: 'Grok Imagine Image', capabilities: ['txt2img', 'img2img'], type: 'base', access: 25 },
      { id: 'model_ideogram-v3-turbo', name: 'Ideogram 3 Turbo', capabilities: ['txt2img', 'img2img'], type: 'base', access: 25 },
      { id: 'model_imagen4-fast', name: 'Imagen 4 Fast', capabilities: ['txt2img'], type: 'base', access: 50 },
      { id: 'model_openai-gpt-image-1-editing', name: 'GPT Image 1 (OpenAI)', capabilities: ['txt2img', 'img2img'], type: 'base', access: 50 },
      // VIDEO MODELS (sorted by access level)
      { id: 'model_p-video', name: 'P-Video', capabilities: ['txt2video', 'img2video'], type: 'base', access: 0 },
      { id: 'model_xai-grok-imagine-video', name: 'Grok Imagine Video', capabilities: ['txt2video', 'img2video'], type: 'base', access: 0 },
      { id: 'model_pixverse-v4-5', name: 'Pixverse 4.5', capabilities: ['txt2video', 'img2video'], type: 'base', access: 0 },
      { id: 'model_luma-ray-flash-2-720p', name: 'Ray 2 Flash (720p)', capabilities: ['txt2video', 'img2video'], type: 'base', access: 0 },
      { id: 'model_luma-ray-flash-2-540p', name: 'Ray 2 Flash (540p)', capabilities: ['txt2video', 'img2video'], type: 'base', access: 0 },
      { id: 'model_minimax-video-01-director', name: 'Minimax 01 Director', capabilities: ['txt2video', 'img2video'], type: 'base', access: 0 },
      { id: 'model_wan-2-2-t2v', name: 'Wan 2.2 T2V', capabilities: ['txt2video'], type: 'base', access: 0 },
      { id: 'model_wan-2-1-1-3b', name: 'Wan 2.1 (1.3B)', capabilities: ['txt2video'], type: 'base', access: 0 },
      { id: 'model_kling-v1-6-standard', name: 'Kling 1.6 (720p)', capabilities: ['img2video'], type: 'base', access: 0 },
      { id: 'model_scenario-image-seq-to-video', name: 'Sequence-to-Video', capabilities: ['img2video'], type: 'base', access: 0 },
      { id: 'model_kling-v2-1', name: 'Kling 2.1', capabilities: ['img2video'], type: 'base', access: 25 },
      { id: 'model_kling-v2-1-master', name: 'Kling 2.1 Master', capabilities: ['img2video', 'txt2video'], type: 'base', access: 25 },
      { id: 'model_minimax-video-01', name: 'Minimax Video 01', capabilities: ['txt2video', 'img2video'], type: 'base', access: 25 },
      { id: 'model_minimax-hailuo-02', name: 'Minimax Video 02', capabilities: ['txt2video', 'img2video'], type: 'base', access: 25 },
      { id: 'model_runway-gen4-turbo', name: 'Runway Gen4 Turbo', capabilities: ['img2video'], type: 'base', access: 25 },
      { id: 'model_creatify-aurora', name: 'Creatify Aurora', capabilities: ['img2video'], type: 'base', access: 25 },
      { id: 'model_veo3-1-fast', name: 'Veo 3.1 Fast', capabilities: ['txt2video', 'img2video'], type: 'base', access: 25 },
      { id: 'model_veo3-1-lite', name: 'Veo 3.1 Lite', capabilities: ['txt2video', 'img2video'], type: 'base', access: 25 },
      { id: 'model_ltx-2-19b-fast', name: 'LTX-2 19b Fast', capabilities: ['txt2video', 'img2video'], type: 'base', access: 25 },
      { id: 'model_open-ai-sora-2', name: 'SORA 2 (OpenAI)', capabilities: ['txt2video', 'img2video'], type: 'base', access: 25 },
      { id: 'model_wan-2-2-i2v-a14b', name: 'Wan 2.2 I2V', capabilities: ['img2video'], type: 'base', access: 25 },
      { id: 'model_veo3', name: 'Veo 3', capabilities: ['txt2video'], type: 'base', access: 50 },
      { id: 'model_kling-v2-1-pro', name: 'Kling 2.1 Pro', capabilities: ['img2video'], type: 'base', access: 50 },
    ];

    // Also fetch user's public LoRA models
    let loraModels: any[] = [];
    try {
      const publicResult = await client.listModels({ privacy: 'public', pageSize: 50 });
      loraModels = (publicResult.models ?? []).map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        capabilities: m.capabilities || [],
        type: 'lora',
        access: m.accessRestrictions ?? 0,
      }));
    } catch {}

    res.json({ success: true, models: [...baseModels, ...loraModels] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch models' });
  }
});

// Serve static client files in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
