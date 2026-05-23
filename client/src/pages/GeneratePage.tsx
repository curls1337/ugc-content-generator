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
  ArrowRight,
  Download,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../store';
import { generatePrompts, generateImage, generateVideo, pollJob as pollJobApi, listModels } from '../api/client';
import { addLog } from '../components/LogPanel';
import type { JobStatus } from '@shared/types';

const POLL_INTERVAL_MS = 6000;

const VIDEO_DURATIONS = [5, 8, 10, 15];
const VOICE_LANGUAGES: { value: 'none' | 'id' | 'en'; label: string; flag: string }[] = [
  { value: 'none', label: 'No Voice', flag: '🔇' },
  { value: 'id', label: 'Indonesia', flag: '🇮🇩' },
  { value: 'en', label: 'English', flag: '🇬🇧' },
];

function ProgressCard({ jobStatus, elapsedSeconds, label }: { jobStatus: JobStatus; elapsedSeconds: number; label: string }) {
  const pct = Math.round(jobStatus.progress * 100);
  const statusText = jobStatus.status === 'queued' ? 'In Queue...' : jobStatus.status === 'processing' ? 'Generating...' : jobStatus.status === 'success' ? 'Done!' : 'Failed';
  const fmt = (s: number) => s > 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`;
  return (
    <div className="rounded-xl border border-zinc-800 bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{label}</span>
        <span className="text-xs text-zinc-500 flex items-center gap-1"><Clock className="w-3 h-3" />{fmt(elapsedSeconds)}</span>
      </div>
      <div className="flex items-center gap-2">
        {jobStatus.status === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
         jobStatus.status === 'failed' || jobStatus.status === 'canceled' ? <AlertCircle className="w-4 h-4 text-red-400" /> :
         <Loader2 className="w-4 h-4 animate-spin text-accent" />}
        <span className="text-sm text-zinc-200">{statusText}</span>
        <span className="ml-auto text-xs text-zinc-400">{pct}%</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${jobStatus.status === 'failed' ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${Math.max(pct, 3)}%` }} />
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
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string; capabilities: string[]; access?: number }[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sceneRefs, setSceneRefs] = useState<Record<number, string>>({}); // per-scene reference image
  const [sceneJobs, setSceneJobs] = useState<Record<number, { jobId: string; status: string; progress: number; error?: string }>>({}); // per-scene job status

  const {
    productData, selectedImages, mode, videoDuration, voiceLanguage, voiceStyle,
    prompts, activeJobId, jobStatus, isGenerating, generateError,
    geminiKeys, geminiModel, scenarioApiKey, scenarioApiSecret, scenarioKeyValid,
    characterImage, generatedImages, selectedGeneratedImage,
    setMode, setVideoDuration, setVoiceLanguage, setVoiceStyle,
    setPrompts, setActiveJobId, setJobStatus, setIsGenerating, setGenerateError,
    addGeneratedImage, setSelectedGeneratedImage, setGeneratedImages,
  } = useAppStore();

  useEffect(() => { if (!productData) navigate('/', { replace: true }); }, [productData, navigate]);
  useEffect(() => { if (productData && selectedImages.length === 0) navigate('/select', { replace: true }); }, [productData, selectedImages, navigate]);

  // Fetch models
  useEffect(() => {
    if (!scenarioApiKey || !scenarioApiSecret) return;
    setLoadingModels(true);
    listModels(scenarioApiKey, scenarioApiSecret).then((data: any) => {
      if (data.success && data.models) {
        setAvailableModels(data.models.map((m: any) => ({ id: m.id, name: m.name || m.id, capabilities: m.capabilities || [], access: m.access ?? 0 })));
        const img = data.models.find((m: any) => (m.capabilities || []).some((c: string) => c === 'txt2img' || c === 'img2img') && (m.access ?? 0) === 0);
        const vid = data.models.find((m: any) => (m.capabilities || []).some((c: string) => c === 'txt2video' || c === 'img2video') && (m.access ?? 0) === 0);
        if (img && !imageModel) setImageModel(img.id);
        if (vid && !videoModel) setVideoModel(vid.id);
      }
    }).catch(() => {}).finally(() => setLoadingModels(false));
  }, [scenarioApiKey, scenarioApiSecret]);

  // Timer
  useEffect(() => {
    let t: any = null;
    if (isGenerating && startTimeRef.current) t = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000)), 1000);
    return () => { if (t) clearInterval(t); };
  }, [isGenerating]);

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const validGeminiKeys = geminiKeys.filter(k => k.valid).map(k => k.key);
  const imageModels = availableModels.filter(m => m.capabilities.some(c => c === 'txt2img' || c === 'img2img'));
  const videoModels = availableModels.filter(m => m.capabilities.some(c => c === 'txt2video' || c === 'img2video'));

  const stopPolling = useCallback(() => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }, []);

  const pollJob = useCallback(async (jobId: string) => {
    try {
      const data = await pollJobApi(jobId, scenarioApiKey, scenarioApiSecret);
      if (!data.success || !data.job) return;
      setJobStatus(data.job);
      if (data.job.status === 'success' || data.job.status === 'failed' || data.job.status === 'canceled') {
        stopPolling(); setIsGenerating(false);
        if (data.job.status === 'failed') setGenerateError(data.job.error || 'Generation failed');
      }
    } catch {}
  }, [scenarioApiKey, scenarioApiSecret, setJobStatus, setIsGenerating, setGenerateError, stopPolling]);

  const startPolling = useCallback((jobId: string) => { stopPolling(); pollRef.current = setInterval(() => pollJob(jobId), POLL_INTERVAL_MS); pollJob(jobId); }, [pollJob, stopPolling]);

  // Generate prompts
  const handleGeneratePrompts = async () => {
    if (!productData) return;
    setIsGeneratingPrompts(true); setGenerateError(null); setPrompts([]);
    let charB64: string | undefined, charMime: string | undefined;
    if (characterImage) { const m = characterImage.match(/^data:(image\/[^;]+);base64,(.+)$/); if (m) { charMime = m[1]; charB64 = m[2]; } }
    addLog('info', `Generating ${step === 2 ? 'image' : 'video'} prompts...`);
    const data = await generatePrompts({ product: productData, selectedImages, mode: step === 2 ? 'image' : 'video', geminiKeys: validGeminiKeys, geminiModel, characterImageBase64: charB64, characterImageMime: charMime });
    if (!data.success) { setGenerateError(data.error || 'Failed'); addLog('error', data.error || ''); }
    else { setPrompts(data.prompts ?? []); addLog('success', `${data.prompts?.length} prompts ready`); }
    setIsGeneratingPrompts(false);
  };

  // Generate content (per scene, non-blocking)
  const handleGenerate = async (promptIdx: number) => {
    const prompt = prompts[promptIdx]; if (!prompt) return;
    setGenerateError(null);

    // Update scene job status
    setSceneJobs(prev => ({ ...prev, [promptIdx]: { jobId: '', status: 'starting', progress: 0 } }));

    let data: { success: boolean; jobId?: string; error?: string };

    if (step === 2) {
      const refImg = sceneRefs[promptIdx] || selectedImages[0] || '';
      addLog('info', `Scene ${promptIdx + 1} IMAGE gen | ${imageModel}`);
      data = await generateImage({ prompt, referenceImages: refImg ? [refImg] : selectedImages.slice(0, 1), modelId: imageModel, numOutputs: 1, width: 1080, height: 1920, scenarioApiKey, scenarioApiSecret });
    } else {
      const ref = selectedGeneratedImage ? [selectedGeneratedImage] : selectedImages.slice(0, 1);
      let enhanced = prompt;
      if (voiceLanguage !== 'none') enhanced += `\n\nCharacter speaks ${voiceLanguage === 'id' ? 'Bahasa Indonesia' : 'English'} naturally.`;
      addLog('info', `Scene ${promptIdx + 1} VIDEO gen | ${videoModel} | ${videoDuration}s`);
      data = await generateVideo({ prompt: enhanced, referenceImages: ref, modelId: videoModel, duration: videoDuration, aspectRatio: '9:16', scenarioApiKey, scenarioApiSecret });
    }

    if (!data.success) {
      addLog('error', `Scene ${promptIdx + 1} failed: ${data.error}`);
      setSceneJobs(prev => ({ ...prev, [promptIdx]: { jobId: '', status: 'failed', progress: 0, error: data.error } }));
      return;
    }

    addLog('success', `Scene ${promptIdx + 1} job: ${data.jobId}`);
    const jobId = data.jobId!;
    setSceneJobs(prev => ({ ...prev, [promptIdx]: { jobId, status: 'queued', progress: 0 } }));

    // Start polling this specific scene job
    const pollScene = async () => {
      const interval = setInterval(async () => {
        try {
          const pollData = await pollJobApi(jobId, scenarioApiKey, scenarioApiSecret);
          if (!pollData.success || !pollData.job) return;
          const job = pollData.job;
          setSceneJobs(prev => ({ ...prev, [promptIdx]: { jobId, status: job.status, progress: job.progress } }));

          if (job.status === 'success' || job.status === 'failed' || job.status === 'canceled') {
            clearInterval(interval);
            if (job.status === 'failed') {
              setSceneJobs(prev => ({ ...prev, [promptIdx]: { jobId, status: 'failed', progress: 0, error: job.error || 'Failed' } }));
            }
            addLog(job.status === 'success' ? 'success' : 'error', `Scene ${promptIdx + 1}: ${job.status}`);
          }
        } catch {}
      }, POLL_INTERVAL_MS);
    };
    pollScene();
  };

  // Generate ALL scenes at once
  const handleGenerateAll = () => {
    prompts.forEach((_, i) => {
      // Stagger by 500ms to avoid rate limits
      setTimeout(() => handleGenerate(i), i * 500);
    });
  };

  if (!productData) return null;
  const hasKeys = validGeminiKeys.length > 0 && scenarioKeyValid;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">UGC Content Studio</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Product → Scene Image → Video</p>
        </div>
        <div className="flex items-center gap-2">
          {productData && <img src={selectedImages[0]} alt="" className="w-8 h-8 rounded-lg object-cover border border-zinc-700" />}
          {characterImage && <img src={characterImage} alt="" className="w-8 h-8 rounded-lg object-cover border border-indigo-500/50" />}
        </div>
      </div>

      {/* Step tabs */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { n: 1, icon: Wand2, label: 'Setup', sub: 'Model & Settings' },
          { n: 2, icon: ImageIcon, label: 'Scene Image', sub: 'Product + Character' },
          { n: 3, icon: Film, label: 'Video', sub: 'Image → Video' },
        ].map((s) => (
          <button key={s.n} onClick={() => setStep(s.n as any)}
            className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${step === s.n ? 'bg-accent/10 border-accent text-white' : step > s.n ? 'bg-emerald-500/5 border-emerald-500/30 text-emerald-300' : 'bg-surface border-zinc-800 text-zinc-400'}`}>
            <s.icon className="w-4 h-4 shrink-0" />
            <div className="text-left min-w-0">
              <div className="text-xs font-semibold truncate">{s.label}</div>
              <div className="text-[10px] opacity-70 truncate">{s.sub}</div>
            </div>
          </button>
        ))}
      </div>

      {/* STEP 1: Setup */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Image Model */}
          <div className="rounded-xl border border-zinc-800 bg-surface p-5 space-y-3">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2"><ImageIcon className="w-3.5 h-3.5" />Image Model</h3>
            {loadingModels ? <div className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" />Loading...</div> : (
              <select value={imageModel} onChange={e => setImageModel(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-sm">
                {imageModels.map(m => <option key={m.id} value={m.id}>{m.name} {m.access === 0 ? '✅' : m.access === 25 ? '⚡' : '👑'}</option>)}
              </select>
            )}
          </div>

          {/* Video Model + Settings */}
          <div className="rounded-xl border border-zinc-800 bg-surface p-5 space-y-4">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2"><Film className="w-3.5 h-3.5" />Video Model & Settings</h3>
            <select value={videoModel} onChange={e => setVideoModel(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-sm">
              {videoModels.map(m => <option key={m.id} value={m.id}>{m.name} {m.access === 0 ? '✅' : m.access === 25 ? '⚡' : '👑'}</option>)}
            </select>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400">Duration</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {VIDEO_DURATIONS.map(d => (
                    <button key={d} onClick={() => setVideoDuration(d)} className={`py-2 rounded-lg text-xs font-semibold transition-all ${videoDuration === d ? 'bg-accent text-white' : 'bg-bg border border-zinc-700 text-zinc-300'}`}>{d}s</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400">Voice</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {VOICE_LANGUAGES.map(l => (
                    <button key={l.value} onClick={() => setVoiceLanguage(l.value)} className={`py-2 rounded-lg text-xs font-semibold transition-all ${voiceLanguage === l.value ? 'bg-accent text-white' : 'bg-bg border border-zinc-700 text-zinc-300'}`}>{l.flag}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Character preview */}
          {characterImage && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 flex items-center gap-3">
              <img src={characterImage} alt="" className="w-10 h-10 rounded-lg object-cover" />
              <div className="text-xs"><div className="font-medium text-indigo-300">Character loaded</div><div className="text-zinc-500">Will be used as talent reference</div></div>
              <button onClick={() => navigate('/character')} className="ml-auto text-[10px] px-2 py-1 rounded border border-indigo-500/30 text-indigo-300">Change</button>
            </div>
          )}

          <button onClick={() => setStep(2)} disabled={!hasKeys || imageModels.length === 0}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium text-sm disabled:opacity-50 transition-all">
            Next: Generate Scene Images <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* STEP 2: Generate Scene Images */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-surface p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Scene Prompts</h3>
              <span className="text-[10px] text-zinc-500">Product preserved • Character included</span>
            </div>
            <div className="flex gap-2">
              <button onClick={handleGeneratePrompts} disabled={isGeneratingPrompts || isGenerating}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium disabled:opacity-50">
                {isGeneratingPrompts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {prompts.length > 0 ? 'Regenerate Prompts' : 'Generate Prompts'}
              </button>
              {prompts.length > 0 && (
                <button onClick={handleGenerateAll} disabled={!imageModel}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50">
                  <Zap className="w-4 h-4" />Generate All
                </button>
              )}
            </div>
          </div>

          {prompts.length > 0 && (
            <div className="space-y-3">
              {prompts.map((p, i) => {
                const refImg = sceneRefs[i] || selectedImages[0] || '';
                const job = sceneJobs[i];
                const isRunning = job && (job.status === 'queued' || job.status === 'processing' || job.status === 'starting');
                const isDone = job?.status === 'success';
                const isFailed = job?.status === 'failed';
                return (
                  <div key={i} className={`rounded-xl border bg-surface p-4 space-y-3 ${isDone ? 'border-emerald-500/30' : isFailed ? 'border-red-500/30' : 'border-zinc-800'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-zinc-500">SCENE {i + 1}</span>
                      <div className="flex items-center gap-2">
                        {isRunning && <span className="flex items-center gap-1 text-[10px] text-accent"><Loader2 className="w-3 h-3 animate-spin" />{Math.round((job.progress || 0) * 100)}%</span>}
                        {isDone && <span className="flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 className="w-3 h-3" />Done</span>}
                        {isFailed && <span className="flex items-center gap-1 text-[10px] text-red-400"><AlertCircle className="w-3 h-3" />Failed</span>}
                        <span className="text-[10px] text-zinc-600">{p.length} chars</span>
                      </div>
                    </div>

                    {/* Reference image selector */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-medium text-zinc-400">Reference Image (product)</label>
                      <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {selectedImages.map((img, idx) => {
                          const isActive = refImg === img;
                          return (
                            <button key={idx} onClick={() => setSceneRefs(prev => ({ ...prev, [i]: img }))}
                              className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${isActive ? 'border-accent ring-1 ring-accent/50' : 'border-zinc-700 opacity-50 hover:opacity-80'}`}>
                              <img src={img} alt={`Ref ${idx + 1}`} className="w-full h-full object-cover" />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <textarea value={p} onChange={e => { const u = [...prompts]; u[i] = e.target.value; setPrompts(u); }} rows={2} disabled={isRunning}
                      className="w-full px-3 py-2 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-[11px] leading-relaxed resize-y disabled:opacity-50" />
                    
                    {/* Per-scene progress bar */}
                    {isRunning && (
                      <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(Math.round((job.progress || 0) * 100), 5)}%` }} />
                      </div>
                    )}

                    {isFailed && <p className="text-[10px] text-red-400">{job.error}</p>}

                    <button onClick={() => handleGenerate(i)} disabled={isRunning || !imageModel}
                      className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-white text-xs font-medium disabled:opacity-50 ${isDone ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
                      <Zap className="w-3.5 h-3.5" />{isDone ? 'Regenerate' : 'Generate Scene Image'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Generated images grid */}
          {generatedImages.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Generated Scenes ({generatedImages.length})</h3>
                <button onClick={() => setStep(3)} className="flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover">
                  Next: Make Video <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {generatedImages.map((url, i) => (
                  <div key={i} className="relative aspect-[9/16] rounded-lg overflow-hidden border border-zinc-700 group">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <a href={url} download target="_blank" rel="noopener noreferrer"
                      className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Download className="w-3 h-3 text-white" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {generateError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1"><p className="text-xs text-red-300">{generateError}</p>
                <button onClick={() => { setGenerateError(null); setJobStatus(null); setIsGenerating(false); stopPolling(); }} className="mt-1 text-[10px] text-red-300 underline">Retry</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Generate Video */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Select start frame */}
          <div className="rounded-xl border border-zinc-800 bg-surface p-4 space-y-3">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Select Start Frame for Video</h3>
            <p className="text-[10px] text-zinc-500">Pick the best scene image as the first frame. The AI will animate it into a video.</p>
            {generatedImages.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {generatedImages.map((url) => {
                  const sel = selectedGeneratedImage === url;
                  return (
                    <button key={url} onClick={() => setSelectedGeneratedImage(sel ? null : url)}
                      className={`relative aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all ${sel ? 'border-accent ring-2 ring-accent/30' : 'border-zinc-700 opacity-50 hover:opacity-100'}`}>
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      {sel && <div className="absolute inset-0 bg-accent/20 flex items-center justify-center"><CheckCircle2 className="w-6 h-6 text-white" /></div>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-zinc-500 text-xs">
                <p>No scene images yet.</p>
                <button onClick={() => setStep(2)} className="mt-2 text-accent underline">Go back to generate images first</button>
              </div>
            )}
          </div>

          {/* Video settings summary */}
          <div className="rounded-xl border border-zinc-800 bg-surface p-3 flex flex-wrap items-center gap-2 text-[10px]">
            <span className="px-2 py-0.5 rounded bg-accent/10 text-accent font-bold">VIDEO</span>
            <span className="text-zinc-300">{videoModel.replace('model_', '')}</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-300">{videoDuration}s</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-300">{voiceLanguage === 'none' ? '🔇 Silent' : voiceLanguage === 'id' ? '🇮🇩 Indo' : '🇬🇧 EN'}</span>
            <button onClick={() => setStep(1)} className="ml-auto text-accent hover:underline">Edit</button>
          </div>

          {/* Generate video prompts */}
          <div className="rounded-xl border border-zinc-800 bg-surface p-4 space-y-3">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Video Prompts</h3>
            <button onClick={handleGeneratePrompts} disabled={isGeneratingPrompts || isGenerating}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium disabled:opacity-50">
              {isGeneratingPrompts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate Video Prompts
            </button>

            {prompts.length > 0 && (
              <div className="space-y-3 mt-3">
                {prompts.map((p, i) => (
                  <div key={i} className="space-y-2">
                    <textarea value={p} onChange={e => { const u = [...prompts]; u[i] = e.target.value; setPrompts(u); }} rows={2} disabled={isGenerating}
                      className="w-full px-3 py-2 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-[11px] leading-relaxed resize-y disabled:opacity-50" />
                    <button onClick={() => handleGenerate(i)} disabled={isGenerating || !videoModel || (!selectedGeneratedImage && generatedImages.length > 0)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50">
                      <Play className="w-3.5 h-3.5" />Generate Video
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Progress */}
          {(isGenerating || jobStatus) && jobStatus && <ProgressCard jobStatus={jobStatus} elapsedSeconds={elapsedSeconds} label="Video Generation" />}

          {jobStatus?.status === 'success' && (
            <button onClick={() => navigate('/gallery')} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm">
              <CheckCircle2 className="w-4 h-4" />View in Gallery
            </button>
          )}

          {generateError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1"><p className="text-xs text-red-300">{generateError}</p>
                <button onClick={() => { setGenerateError(null); setJobStatus(null); setIsGenerating(false); stopPolling(); }} className="mt-1 text-[10px] text-red-300 underline">Retry</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
