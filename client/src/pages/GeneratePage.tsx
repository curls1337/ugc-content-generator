import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Image as ImageIcon,
  Film,
  Sparkles,
  Loader2,
  AlertCircle,
  RefreshCw,
  Clock,
  CheckCircle2,
  Wand2,
  Volume2,
  VolumeX,
  Play,
} from 'lucide-react';
import { useAppStore } from '../store';
import { generatePrompts, generateImage, generateVideo, pollJob as pollJobApi, listModels } from '../api/client';
import { addLog } from '../components/LogPanel';
import type { JobStatus } from '@shared/types';

const POLL_INTERVAL_MS = 6000;

const VIDEO_DURATIONS = [5, 8, 10, 15];
const VOICE_LANGUAGES: { value: 'none' | 'id' | 'en'; label: string; flag: string }[] = [
  { value: 'none', label: 'Tanpa Suara (No Voice)', flag: '🔇' },
  { value: 'id', label: 'Bahasa Indonesia', flag: '🇮🇩' },
  { value: 'en', label: 'English', flag: '🇬🇧' },
];
const VOICE_STYLES: { value: 'casual' | 'energetic' | 'professional' | 'storytelling'; label: string }[] = [
  { value: 'casual', label: 'Casual & Santai' },
  { value: 'energetic', label: 'Energetic & Hype' },
  { value: 'professional', label: 'Professional & Trustworthy' },
  { value: 'storytelling', label: 'Storytelling & Personal' },
];

function ProgressBar({ jobStatus, elapsedSeconds }: { jobStatus: JobStatus; elapsedSeconds: number }) {
  const progressPercent = Math.round(jobStatus.progress * 100);
  const statusLabel =
    jobStatus.status === 'queued' ? 'Queued in Scenario...' :
    jobStatus.status === 'processing' ? 'Generating with AI...' :
    jobStatus.status === 'success' ? 'Completed!' :
    jobStatus.status === 'failed' ? 'Failed' : 'Canceled';
  const formatElapsed = (s: number) => s > 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {jobStatus.status === 'processing' || jobStatus.status === 'queued' ? (
            <Loader2 className="w-4 h-4 animate-spin text-accent" />
          ) : jobStatus.status === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400" />
          )}
          <span className="text-zinc-300 font-medium">{statusLabel}</span>
        </div>
        <div className="flex items-center gap-3 text-zinc-400">
          <span>{progressPercent}%</span>
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatElapsed(elapsedSeconds)}</span>
        </div>
      </div>
      <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${jobStatus.status === 'failed' ? 'bg-red-500' : 'bg-accent'}`}
          style={{ width: `${Math.max(progressPercent, 5)}%` }}
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
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1); // 1=Setup, 2=Generate Image, 3=Generate Video

  const {
    productData,
    selectedImages,
    mode,
    videoDuration,
    voiceLanguage,
    voiceStyle,
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
    characterImage,
    generatedImages,
    selectedGeneratedImage,
    setMode,
    setVideoDuration,
    setVoiceLanguage,
    setVoiceStyle,
    setPrompts,
    setActiveJobId,
    setJobStatus,
    setIsGenerating,
    setGenerateError,
    setSelectedGeneratedImage,
  } = useAppStore();

  useEffect(() => {
    if (!productData) navigate('/', { replace: true });
    else if (selectedImages.length === 0) navigate('/select', { replace: true });
  }, [productData, selectedImages, navigate]);

  // Fetch available models
  useEffect(() => {
    if (!scenarioApiKey || !scenarioApiSecret) return;
    setLoadingModels(true);
    listModels(scenarioApiKey, scenarioApiSecret).then((data: any) => {
      if (data.success && data.models) {
        const models = data.models.map((m: any) => ({
          id: m.id,
          name: m.name || m.id,
          capabilities: m.capabilities || []
        }));
        setAvailableModels(models);
        const imgModel = models.find((m: any) => m.capabilities.some((c: string) => c === 'txt2img' || c === 'img2img'));
        const vidModel = models.find((m: any) => m.capabilities.some((c: string) => c === 'txt2video' || c === 'img2video'));
        if (imgModel && !imageModel) setImageModel(imgModel.id);
        if (vidModel && !videoModel) setVideoModel(vidModel.id);
      }
    }).catch(() => {}).finally(() => setLoadingModels(false));
  }, [scenarioApiKey, scenarioApiSecret]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (isGenerating && startTimeRef.current) {
      timer = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000));
      }, 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [isGenerating]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const validGeminiKeys = geminiKeys.filter((k) => k.valid).map((k) => k.key);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollJob = useCallback(async (jobId: string) => {
    try {
      const data = await pollJobApi(jobId, scenarioApiKey, scenarioApiSecret);
      if (!data.success || !data.job) return;
      const job: JobStatus = data.job;
      setJobStatus(job);
      addLog('info', `Polling: ${job.status} | ${Math.round(job.progress * 100)}%`);
      if (job.status === 'success' || job.status === 'failed' || job.status === 'canceled') {
        stopPolling();
        setIsGenerating(false);
        if (job.status === 'failed') {
          setGenerateError(job.error || 'Generation failed.');
        } else if (job.status === 'success' && mode === 'image') {
          // Auto-advance to step 3 (video) after image success
          setTimeout(() => setActiveStep(3), 1500);
        }
      }
    } catch {}
  }, [scenarioApiKey, scenarioApiSecret, setJobStatus, setIsGenerating, setGenerateError, stopPolling, mode]);

  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    pollRef.current = setInterval(() => pollJob(jobId), POLL_INTERVAL_MS);
    pollJob(jobId);
  }, [pollJob, stopPolling]);

  const handleGeneratePrompts = async () => {
    if (!productData) return;
    setIsGeneratingPrompts(true);
    setGenerateError(null);
    setPrompts([]);

    let characterImageBase64: string | undefined;
    let characterImageMime: string | undefined;
    if (characterImage) {
      const match = characterImage.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (match) {
        characterImageMime = match[1];
        characterImageBase64 = match[2];
      }
    }

    addLog('info', `Generating prompts | mode=${mode} | character=${!!characterImage}`);
    const data = await generatePrompts({
      product: productData,
      selectedImages,
      mode,
      geminiKeys: validGeminiKeys,
      geminiModel,
      characterImageBase64,
      characterImageMime,
    });

    if (!data.success) {
      addLog('error', `Prompt failed: ${data.error}`);
      setGenerateError(data.error || 'Failed to generate prompts.');
    } else {
      addLog('success', `Got ${data.prompts?.length || 0} prompts`);
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
      addLog('info', `Generate IMAGE | model=${imageModel}`);
      data = await generateImage({
        prompt,
        referenceImages: selectedImages.slice(0, 3),
        modelId: imageModel,
        numOutputs: 2,
        width: 1080,
        height: 1920,
        scenarioApiKey,
        scenarioApiSecret,
      });
    } else {
      const videoRefImages = selectedGeneratedImage ? [selectedGeneratedImage] : selectedImages.slice(0, 1);
      addLog('info', `Generate VIDEO | model=${videoModel} | ${videoDuration}s | voice=${voiceLanguage}`);
      
      // Build enhanced prompt with voice instructions
      let enhancedPrompt = prompt;
      if (voiceLanguage !== 'none') {
        const langText = voiceLanguage === 'id' ? 'Bahasa Indonesia' : 'English';
        const styleText = VOICE_STYLES.find(s => s.value === voiceStyle)?.label || 'casual';
        enhancedPrompt = `${prompt}\n\nThe character speaks ${langText} in a ${styleText} tone, expressing the product's benefits naturally.`;
      } else {
        enhancedPrompt = `${prompt}\n\nNo dialogue. Focus on visual storytelling and natural sound only.`;
      }

      data = await generateVideo({
        prompt: enhancedPrompt,
        referenceImages: videoRefImages,
        modelId: videoModel,
        duration: videoDuration,
        aspectRatio: '9:16',
        scenarioApiKey,
        scenarioApiSecret,
      });
    }

    if (!data.success) {
      addLog('error', `Failed: ${data.error}`);
      setGenerateError(data.error || 'Failed to start generation.');
      setIsGenerating(false);
      return;
    }

    addLog('success', `Job started: ${data.jobId}`);
    const jobId = data.jobId!;
    setActiveJobId(jobId);
    setJobStatus({
      jobId, status: 'queued', progress: 0, assetIds: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    startPolling(jobId);
  };

  const handleSwitchToVideo = () => {
    setMode('video');
    setActiveStep(3);
    setPrompts([]); // Clear image prompts, will regenerate for video
    setJobStatus(null);
    setActiveJobId(null);
  };

  if (!productData) return null;

  const hasValidGeminiKeys = validGeminiKeys.length > 0;
  const hasValidScenarioKey = scenarioKeyValid && scenarioApiKey.trim() !== '';
  const imageModels = availableModels.filter((m) => 
    m.capabilities.some((c) => c === 'txt2img' || c === 'img2img')
  );
  const videoModels = availableModels.filter((m) => 
    m.capabilities.some((c) => c === 'txt2video' || c === 'img2video')
  );
  const filteredModels = mode === 'image' ? imageModels : videoModels;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Generate UGC Content</h1>
        <p className="mt-1 text-sm text-zinc-400">Workflow: Setup → Generate Image → Generate Video</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[
          { num: 1, label: 'Setup', desc: 'Pilih mode & model' },
          { num: 2, label: 'Image', desc: 'Generate gambar' },
          { num: 3, label: 'Video', desc: 'Generate video' },
        ].map((s, i) => (
          <div key={s.num} className="flex items-center gap-2 flex-1">
            <button
              onClick={() => setActiveStep(s.num as 1 | 2 | 3)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all flex-1 ${
                activeStep === s.num 
                  ? 'bg-accent text-white border-accent' 
                  : activeStep > s.num
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-surface text-zinc-400 border-zinc-800'
              }`}
            >
              <span className="w-6 h-6 rounded-full bg-black/20 flex items-center justify-center text-xs font-bold">
                {activeStep > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num}
              </span>
              <div className="text-left">
                <div className="text-xs font-semibold">{s.label}</div>
                <div className="text-[10px] opacity-70">{s.desc}</div>
              </div>
            </button>
            {i < 2 && <div className="w-4 h-px bg-zinc-700" />}
          </div>
        ))}
      </div>

      {/* Step 1: Setup */}
      {activeStep === 1 && (
        <div className="space-y-4">
          {/* Mode selector */}
          <div className="rounded-xl border border-zinc-800 bg-surface p-5 space-y-4">
            <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">1. Output Type</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode('image')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  mode === 'image' ? 'border-accent bg-accent/10' : 'border-zinc-700 bg-bg hover:border-zinc-600'
                }`}
              >
                <ImageIcon className={`w-6 h-6 mx-auto mb-2 ${mode === 'image' ? 'text-accent' : 'text-zinc-400'}`} />
                <div className="text-sm font-medium text-zinc-200">Image First</div>
                <div className="text-[10px] text-zinc-500 mt-1">Generate gambar dulu, lalu video</div>
              </button>
              <button
                onClick={() => setMode('video')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  mode === 'video' ? 'border-accent bg-accent/10' : 'border-zinc-700 bg-bg hover:border-zinc-600'
                }`}
              >
                <Film className={`w-6 h-6 mx-auto mb-2 ${mode === 'video' ? 'text-accent' : 'text-zinc-400'}`} />
                <div className="text-sm font-medium text-zinc-200">Video Direct</div>
                <div className="text-[10px] text-zinc-500 mt-1">Langsung generate video</div>
              </button>
            </div>
          </div>

          {/* AI Model */}
          <div className="rounded-xl border border-zinc-800 bg-surface p-5 space-y-3">
            <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">2. AI Model ({mode === 'image' ? 'Image' : 'Video'})</h2>
            {loadingModels ? (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin" />Loading models...
              </div>
            ) : (
              <select
                value={mode === 'image' ? imageModel : videoModel}
                onChange={(e) => mode === 'image' ? setImageModel(e.target.value) : setVideoModel(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-sm"
              >
                {filteredModels.length === 0 ? (
                  <option value="">No models available</option>
                ) : (
                  filteredModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))
                )}
              </select>
            )}
            <p className="text-xs text-zinc-500">{filteredModels.length} model tersedia di plan Anda</p>
          </div>

          {/* Video options (only when video mode) */}
          {mode === 'video' && (
            <div className="rounded-xl border border-zinc-800 bg-surface p-5 space-y-4">
              <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">3. Video Settings</h2>
              
              {/* Duration */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Durasi Video</label>
                <div className="grid grid-cols-4 gap-2">
                  {VIDEO_DURATIONS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setVideoDuration(d)}
                      className={`py-2.5 rounded-lg border text-sm font-medium transition-all ${
                        videoDuration === d ? 'bg-accent text-white border-accent' : 'bg-bg border-zinc-700 text-zinc-300 hover:border-zinc-600'
                      }`}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice Language */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />Bahasa Suara
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {VOICE_LANGUAGES.map((l) => (
                    <button
                      key={l.value}
                      onClick={() => setVoiceLanguage(l.value)}
                      className={`py-2 px-2 rounded-lg border text-xs font-medium transition-all ${
                        voiceLanguage === l.value ? 'bg-accent text-white border-accent' : 'bg-bg border-zinc-700 text-zinc-300 hover:border-zinc-600'
                      }`}
                    >
                      <span className="block text-base mb-0.5">{l.flag}</span>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice Style */}
              {voiceLanguage !== 'none' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Style Suara</label>
                  <select
                    value={voiceStyle}
                    onChange={(e) => setVoiceStyle(e.target.value as any)}
                    className="w-full px-3 py-2.5 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-sm"
                  >
                    {VOICE_STYLES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setActiveStep(2)}
            disabled={!hasValidGeminiKeys || !hasValidScenarioKey || filteredModels.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Lanjut ke Generate
            <Wand2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Step 2 & 3: Prompts + Generate */}
      {(activeStep === 2 || activeStep === 3) && (
        <div className="space-y-4">
          {/* Character info */}
          {characterImage && (
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3 flex items-center gap-3">
              <img src={characterImage} alt="Character" className="w-10 h-10 rounded-lg object-cover" />
              <div className="flex-1 text-xs">
                <div className="font-medium text-indigo-300">Character aktif</div>
                <div className="text-zinc-400">Akan jadi talent di video</div>
              </div>
              <button onClick={() => navigate('/character')} className="text-xs px-3 py-1 rounded border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10">
                Ubah
              </button>
            </div>
          )}

          {/* Settings summary */}
          <div className="rounded-xl border border-zinc-800 bg-surface p-3 flex flex-wrap items-center gap-3 text-xs">
            <span className="px-2 py-1 rounded bg-accent/10 text-accent font-medium">{mode.toUpperCase()}</span>
            <span className="text-zinc-400">{(mode === 'image' ? imageModel : videoModel).replace('model_', '')}</span>
            {mode === 'video' && (
              <>
                <span className="text-zinc-500">•</span>
                <span className="text-zinc-300">{videoDuration}s</span>
                <span className="text-zinc-500">•</span>
                <span className="text-zinc-300 flex items-center gap-1">
                  {voiceLanguage === 'none' ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  {VOICE_LANGUAGES.find(l => l.value === voiceLanguage)?.flag} {voiceLanguage === 'none' ? 'No voice' : voiceStyle}
                </span>
              </>
            )}
            <button onClick={() => setActiveStep(1)} className="ml-auto text-accent hover:underline">Edit</button>
          </div>

          {/* Generated images for video chained workflow */}
          {mode === 'video' && generatedImages.length > 0 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-medium text-emerald-300 uppercase tracking-wider">Pilih Image untuk Frame Pertama Video</h3>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {generatedImages.map((url) => {
                  const isSelected = selectedGeneratedImage === url;
                  return (
                    <button
                      key={url}
                      onClick={() => setSelectedGeneratedImage(isSelected ? null : url)}
                      className={`relative aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all ${
                        isSelected ? 'border-emerald-400 ring-2 ring-emerald-400/30' : 'border-zinc-700 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      {isSelected && (
                        <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Generate prompts */}
          <button
            onClick={handleGeneratePrompts}
            disabled={!hasValidGeminiKeys || isGenerating || isGeneratingPrompts}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm disabled:opacity-50"
          >
            {isGeneratingPrompts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {prompts.length > 0 ? 'Regenerate Prompts' : 'Generate Prompts'}
          </button>

          {/* Prompts list */}
          {prompts.length > 0 && (
            <div className="space-y-3">
              {prompts.map((prompt, i) => (
                <div key={i} className="rounded-xl border border-zinc-800 bg-surface p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-400">Prompt #{i + 1}</span>
                  </div>
                  <textarea
                    value={prompt}
                    onChange={(e) => {
                      const updated = [...prompts];
                      updated[i] = e.target.value;
                      setPrompts(updated);
                    }}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-xs resize-y"
                  />
                  <button
                    onClick={() => handleGenerateContent(i)}
                    disabled={!hasValidScenarioKey || isGenerating}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50"
                  >
                    {mode === 'image' ? <ImageIcon className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    Generate {mode === 'image' ? 'Image' : 'Video'} from this prompt
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Progress */}
          {(isGenerating || jobStatus) && (
            <div className="rounded-xl border border-zinc-800 bg-surface p-5 space-y-3">
              <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">Progress</h3>
              {jobStatus && <ProgressBar jobStatus={jobStatus} elapsedSeconds={elapsedSeconds} />}
              {jobStatus?.status === 'success' && (
                <div className="flex gap-2">
                  {mode === 'image' && (
                    <button
                      onClick={handleSwitchToVideo}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium"
                    >
                      <Film className="w-4 h-4" />
                      Lanjut ke Video
                    </button>
                  )}
                  <button
                    onClick={() => navigate('/gallery')}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Lihat Gallery
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {generateError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{generateError}</p>
              </div>
              <button
                onClick={() => { setGenerateError(null); setJobStatus(null); setActiveJobId(null); setIsGenerating(false); stopPolling(); }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />Retry
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
