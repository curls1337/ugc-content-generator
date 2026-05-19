import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Image,
  Film,
  Sparkles,
  Loader2,
  AlertCircle,
  RefreshCw,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useAppStore } from '../store';
import { generatePrompts, generateImage, generateVideo, pollJob as pollJobApi, listModels } from '../api/client';
import { addLog } from '../components/LogPanel';
import type { JobStatus } from '@shared/types';

const POLL_INTERVAL_MS = 7000;

function ModeToggle({
  mode,
  onModeChange,
  disabled,
}: {
  mode: 'image' | 'video';
  onModeChange: (mode: 'image' | 'video') => void;
  disabled: boolean;
}) {
  return (
    <div className="flex rounded-lg border border-zinc-700 overflow-hidden" role="radiogroup" aria-label="Generation mode">
      <button
        role="radio"
        aria-checked={mode === 'image'}
        onClick={() => onModeChange('image')}
        disabled={disabled}
        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors flex-1 justify-center
          ${mode === 'image'
            ? 'bg-accent text-white'
            : 'bg-surface text-zinc-400 hover:text-zinc-200 hover:bg-surface-hover'
          }
          disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <Image className="w-4 h-4" aria-hidden="true" />
        Image
      </button>
      <button
        role="radio"
        aria-checked={mode === 'video'}
        onClick={() => onModeChange('video')}
        disabled={disabled}
        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors flex-1 justify-center
          ${mode === 'video'
            ? 'bg-accent text-white'
            : 'bg-surface text-zinc-400 hover:text-zinc-200 hover:bg-surface-hover'
          }
          disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <Film className="w-4 h-4" aria-hidden="true" />
        Video
      </button>
    </div>
  );
}

function DurationSlider({
  duration,
  onDurationChange,
  disabled,
}: {
  duration: number;
  onDurationChange: (d: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor="duration-slider" className="text-sm font-medium text-zinc-300">
          Video Duration
        </label>
        <span className="text-sm text-accent font-medium">{duration}s</span>
      </div>
      <input
        id="duration-slider"
        type="range"
        min={5}
        max={15}
        step={1}
        value={duration}
        onChange={(e) => onDurationChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full h-2 rounded-full appearance-none cursor-pointer bg-zinc-700 accent-accent disabled:opacity-50 disabled:cursor-not-allowed"
        aria-valuemin={5}
        aria-valuemax={15}
        aria-valuenow={duration}
        aria-valuetext={`${duration} seconds`}
      />
      <div className="flex justify-between text-xs text-zinc-500">
        <span>5s</span>
        <span>10s</span>
        <span>15s</span>
      </div>
    </div>
  );
}

function ProgressBar({
  jobStatus,
  elapsedSeconds,
}: {
  jobStatus: JobStatus;
  elapsedSeconds: number;
}) {
  const progressPercent = Math.round(jobStatus.progress * 100);
  const statusLabel =
    jobStatus.status === 'queued'
      ? 'Queued'
      : jobStatus.status === 'processing'
        ? 'Generating'
        : jobStatus.status === 'success'
          ? 'Completed'
          : jobStatus.status === 'failed'
            ? 'Failed'
            : 'Canceled';

  const formatElapsed = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {jobStatus.status === 'processing' || jobStatus.status === 'queued' ? (
            <Loader2 className="w-4 h-4 animate-spin text-accent" aria-hidden="true" />
          ) : jobStatus.status === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400" aria-hidden="true" />
          )}
          <span className="text-zinc-300 font-medium">{statusLabel}</span>
        </div>
        <div className="flex items-center gap-3 text-zinc-400">
          <span>{progressPercent}%</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            {formatElapsed(elapsedSeconds)}
          </span>
        </div>
      </div>
      <div className="w-full h-2.5 rounded-full bg-zinc-700 overflow-hidden" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            jobStatus.status === 'failed' ? 'bg-red-500' : 'bg-accent'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

export default function GeneratePage() {
  const navigate = useNavigate();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [imageModel, setImageModel] = useState('');
  const [videoModel, setVideoModel] = useState('');
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string; capabilities: string[] }[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const {
    productData,
    selectedImages,
    mode,
    videoDuration,
    prompts,
    activeJobId,
    jobStatus,
    isGenerating,
    generateError,
    geminiKeys,
    geminiModel,
    scenarioApiKey,
    scenarioApiSecret,
    scenarioKeyValid,
    setMode,
    setVideoDuration,
    setPrompts,
    setActiveJobId,
    setJobStatus,
    setIsGenerating,
    setGenerateError,
  } = useAppStore();

  // Redirect if no product data
  useEffect(() => {
    if (!productData) {
      navigate('/', { replace: true });
    }
  }, [productData, navigate]);

  // Redirect if no selected images
  useEffect(() => {
    if (productData && selectedImages.length === 0) {
      navigate('/select', { replace: true });
    }
  }, [productData, selectedImages, navigate]);

  // Fetch available models from Scenario API
  useEffect(() => {
    if (!scenarioApiKey || !scenarioApiSecret) return;
    setLoadingModels(true);
    listModels(scenarioApiKey, scenarioApiSecret).then((data: any) => {
      if (data.success && data.models) {
        const models = data.models
          .filter((m: any) => m.custom === true && m.status === 'trained')
          .map((m: any) => ({ id: m.id, name: m.name || m.id, capabilities: m.capabilities || [] }));
        setAvailableModels(models);
        // Set defaults
        const imgModel = models.find((m: any) => m.capabilities?.some((c: string) => c === 'txt2img' || c === 'img2img'));
        const vidModel = models.find((m: any) => m.capabilities?.some((c: string) => c === 'txt2video' || c === 'img2video'));
        if (imgModel && !imageModel) setImageModel(imgModel.id);
        if (vidModel && !videoModel) setVideoModel(vidModel.id);
      }
    }).catch(() => {}).finally(() => setLoadingModels(false));
  }, [scenarioApiKey, scenarioApiSecret]);

  // Elapsed time counter during generation
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (isGenerating && startTimeRef.current) {
      timer = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isGenerating]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  // Resume polling if there's an active job on mount
  useEffect(() => {
    if (activeJobId && isGenerating && !pollRef.current) {
      startTimeRef.current = Date.now();
      startPolling(activeJobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validGeminiKeys = geminiKeys.filter((k) => k.valid).map((k) => k.key);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollJob = useCallback(
    async (jobId: string) => {
      try {
        const data = await pollJobApi(jobId, scenarioApiKey, scenarioApiSecret);

        if (!data.success) {
          // Don't stop polling on transient errors
          return;
        }

        const job: JobStatus = data.job!;
        setJobStatus(job);

        if (job.status === 'success' || job.status === 'failed' || job.status === 'canceled') {
          stopPolling();
          setIsGenerating(false);

          if (job.status === 'failed') {
            setGenerateError(job.error || 'Generation failed. Please try again.');
          }
        }
      } catch {
        // Network error during polling - don't stop, retry on next interval
      }
    },
    [scenarioApiKey, scenarioApiSecret, setJobStatus, setIsGenerating, setGenerateError, stopPolling]
  );

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      pollRef.current = setInterval(() => pollJob(jobId), POLL_INTERVAL_MS);
      // Also poll immediately
      pollJob(jobId);
    },
    [pollJob, stopPolling]
  );

  const handleGeneratePrompts = async () => {
    if (!productData) return;

    setIsGeneratingPrompts(true);
    setGenerateError(null);
    setPrompts([]);

    const data = await generatePrompts({
      product: productData,
      selectedImages,
      mode,
      geminiKeys: validGeminiKeys,
      geminiModel,
    });

    if (!data.success) {
      setGenerateError(data.error || 'Failed to generate prompts. Please try again.');
    } else {
      setPrompts(data.prompts ?? []);
    }

    setIsGeneratingPrompts(false);
  };

  const handleGenerateContent = async (promptIndex: number) => {
    const prompt = prompts[promptIndex];
    if (!prompt) return;

    setGenerateError(null);
    setIsGenerating(true);
    setJobStatus(null);
    setActiveJobId(null);
    startTimeRef.current = Date.now();
    setElapsedSeconds(0);

    let data: { success: boolean; jobId?: string; error?: string };

    if (mode === 'image') {
      addLog('info', `Starting image generation with model: ${imageModel}`);
      addLog('info', `Prompt: ${prompt.slice(0, 80)}...`);
      addLog('info', `Reference images: ${selectedImages.length}`);
      data = await generateImage({
        prompt,
        referenceImages: selectedImages.slice(0, 5),
        modelId: imageModel,
        numOutputs: 2,
        width: 1080,
        height: 1920,
        scenarioApiKey,
        scenarioApiSecret,
      });
    } else {
      addLog('info', `Starting video generation with model: ${videoModel}`);
      addLog('info', `Prompt: ${prompt.slice(0, 80)}...`);
      addLog('info', `Duration: ${videoDuration}s, Reference images: ${selectedImages.length}`);
      data = await generateVideo({
        prompt,
        referenceImages: selectedImages.slice(0, 10),
        modelId: videoModel,
        duration: videoDuration,
        aspectRatio: '9:16',
        scenarioApiKey,
        scenarioApiSecret,
      });
    }

    if (!data.success) {
      addLog('error', `Generation failed: ${data.error}`);
      setGenerateError(data.error || 'Failed to start generation. Please try again.');
      setIsGenerating(false);
      return;
    }

    addLog('success', `Job started! ID: ${data.jobId}`);
    const jobId = data.jobId!;
    setActiveJobId(jobId);
    setJobStatus({
      jobId,
      status: 'queued',
      progress: 0,
      assetIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    startPolling(jobId);
  };

  const handleRetry = () => {
    setGenerateError(null);
    setJobStatus(null);
    setActiveJobId(null);
    setIsGenerating(false);
    stopPolling();
  };

  const handlePromptEdit = (index: number, value: string) => {
    const updated = [...prompts];
    updated[index] = value;
    setPrompts(updated);
  };

  // Guard: don't render if no product data
  if (!productData) return null;

  const hasValidGeminiKeys = validGeminiKeys.length > 0;
  const hasValidScenarioKey = scenarioKeyValid && scenarioApiKey.trim() !== '';
  const canGeneratePrompts = hasValidGeminiKeys && !isGenerating && !isGeneratingPrompts;
  const canGenerateContent = hasValidScenarioKey && prompts.length > 0 && !isGenerating;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Generate Content</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Generate AI-powered {mode === 'image' ? 'images' : 'videos'} from your product data.
        </p>
      </div>

      {/* Mode Selection Card */}
      <div className="rounded-xl border border-zinc-800 bg-surface overflow-hidden">
        <div className="p-5 space-y-4">
          <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">Mode</h2>
          <ModeToggle mode={mode} onModeChange={setMode} disabled={isGenerating} />

          {/* Model Selector */}
          <div className="space-y-2">
            <label htmlFor="model-select" className="text-sm font-medium text-zinc-300">
              AI Model
            </label>
            {loadingModels ? (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading models...
              </div>
            ) : (
              <select
                id="model-select"
                value={mode === 'image' ? imageModel : videoModel}
                onChange={(e) => mode === 'image' ? setImageModel(e.target.value) : setVideoModel(e.target.value)}
                disabled={isGenerating}
                className="w-full px-3 py-2.5 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {availableModels
                  .filter((m) => {
                    if (mode === 'image') return m.capabilities.some((c) => c === 'txt2img' || c === 'img2img');
                    return m.capabilities.some((c) => c === 'txt2video' || c === 'img2video');
                  })
                  .map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.id.replace('model_', '')})</option>
                  ))}
                {availableModels.filter((m) => {
                  if (mode === 'image') return m.capabilities.some((c) => c === 'txt2img' || c === 'img2img');
                  return m.capabilities.some((c) => c === 'txt2video' || c === 'img2video');
                }).length === 0 && (
                  <option value="">No models available — check Scenario API key</option>
                )}
              </select>
            )}
            <p className="text-xs text-zinc-500">
              Models fetched from your Scenario account. Only models available on your plan are shown.
            </p>
          </div>

          {mode === 'video' && (
            <DurationSlider
              duration={videoDuration}
              onDurationChange={setVideoDuration}
              disabled={isGenerating}
            />
          )}
        </div>
      </div>

      {/* Prompt Generation Card */}
      <div className="rounded-xl border border-zinc-800 bg-surface overflow-hidden">
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">Prompts</h2>
            {prompts.length > 0 && (
              <span className="text-xs text-zinc-500">{prompts.length} prompt{prompts.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Key warnings */}
          {!hasValidGeminiKeys && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-sm text-amber-300">
                No valid Gemini API keys configured.{' '}
                <button onClick={() => navigate('/settings')} className="underline hover:text-amber-200">
                  Go to Settings
                </button>
              </p>
            </div>
          )}

          {/* Generate Prompts button */}
          <button
            onClick={handleGeneratePrompts}
            disabled={!canGeneratePrompts}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-surface"
          >
            {isGeneratingPrompts ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                Generating Prompts...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                Generate Prompts
              </>
            )}
          </button>

          {/* Prompts list */}
          {prompts.length > 0 && (
            <div className="space-y-3">
              {prompts.map((prompt, index) => (
                <div key={index} className="space-y-2">
                  <label htmlFor={`prompt-${index}`} className="text-xs font-medium text-zinc-400">
                    Prompt {index + 1}
                  </label>
                  <textarea
                    id={`prompt-${index}`}
                    value={prompt}
                    onChange={(e) => handlePromptEdit(index, e.target.value)}
                    disabled={isGenerating}
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-lg bg-bg border border-zinc-700 text-zinc-100 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`Edit prompt ${index + 1}`}
                  />
                  {/* Generate Content button per prompt */}
                  {!isGenerating && (
                    <button
                      onClick={() => handleGenerateContent(index)}
                      disabled={!canGenerateContent}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    >
                      {mode === 'image' ? (
                        <Image className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <Film className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      Generate {mode === 'image' ? 'Image' : 'Video'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Scenario key warning */}
          {prompts.length > 0 && !hasValidScenarioKey && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-sm text-amber-300">
                No valid Scenario API key configured.{' '}
                <button onClick={() => navigate('/settings')} className="underline hover:text-amber-200">
                  Go to Settings
                </button>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Progress Card */}
      {(isGenerating || jobStatus) && (
        <div className="rounded-xl border border-zinc-800 bg-surface overflow-hidden">
          <div className="p-5 space-y-4">
            <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">
              Generation Progress
            </h2>
            {jobStatus && (
              <ProgressBar jobStatus={jobStatus} elapsedSeconds={elapsedSeconds} />
            )}
            {jobStatus?.status === 'success' && (
              <button
                onClick={() => navigate('/gallery')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                View in Gallery
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error display with retry */}
      {generateError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 overflow-hidden">
          <div className="p-5 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-sm text-red-300">{generateError}</p>
              </div>
            </div>
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-600/50"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Product context summary */}
      <div className="rounded-xl border border-zinc-800 bg-surface overflow-hidden">
        <div className="p-5 space-y-3">
          <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">Product Context</h2>
          <div className="flex items-start gap-3">
            {selectedImages[0] && (
              <img
                src={selectedImages[0]}
                alt="Product thumbnail"
                className="w-12 h-12 rounded-lg object-cover border border-zinc-700"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-200 truncate">{productData.title}</p>
              {productData.price && (
                <p className="text-xs text-zinc-400 mt-0.5">{productData.price}</p>
              )}
              <p className="text-xs text-zinc-500 mt-0.5">
                {selectedImages.length} image{selectedImages.length !== 1 ? 's' : ''} selected
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
