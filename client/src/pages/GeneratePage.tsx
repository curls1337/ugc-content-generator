import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Image as ImageIcon, Film, Sparkles, Loader2, AlertCircle, CheckCircle2,
  Wand2, Zap, ArrowRight, Download, RefreshCw, Layers, Camera, Video,
} from 'lucide-react';
import { useAppStore } from '../store';
import { generatePrompts, generateImage, generateVideo, pollJob as pollJobApi, listModels } from '../api/client';
import { addLog } from '../components/LogPanel';

const POLL_MS = 6000;
const VIDEO_DURATIONS = [5, 8, 10, 15];

type SceneJob = { jobId: string; status: string; progress: number; error?: string };

export default function GeneratePage() {
  const navigate = useNavigate();
  const [imageModel, setImageModel] = useState('model_google-gemini-pro-image-editing');
  const [videoModel, setVideoModel] = useState('model_p-video');
  const [models, setModels] = useState<any[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Pipeline state
  const [pipeline, setPipeline] = useState<'setup' | 'background' | 'compose' | 'video'>('setup');
  const [bgPrompts, setBgPrompts] = useState<string[]>([]);
  const [bgJobs, setBgJobs] = useState<Record<number, SceneJob>>({});
  const [bgResults, setBgResults] = useState<string[]>([]); // URLs of background-replaced images
  const [composePrompts, setComposePrompts] = useState<string[]>([]);
  const [composeJobs, setComposeJobs] = useState<Record<number, SceneJob>>({});
  const [composeResults, setComposeResults] = useState<string[]>([]);
  const [videoJobs, setVideoJobs] = useState<Record<number, SceneJob>>({});
  const [selectedForVideo, setSelectedForVideo] = useState<string[]>([]);
  const [videoDuration, setVideoDuration] = useState(8);
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    productData, selectedImages, characterImage,
    geminiKeys, geminiModel, scenarioApiKey, scenarioApiSecret, scenarioKeyValid,
  } = useAppStore();

  useEffect(() => { if (!productData) navigate('/', { replace: true }); }, [productData, navigate]);
  useEffect(() => { if (productData && selectedImages.length === 0) navigate('/select', { replace: true }); }, [productData, selectedImages, navigate]);

  // Fetch models
  useEffect(() => {
    if (!scenarioApiKey || !scenarioApiSecret) return;
    setLoadingModels(true);
    listModels(scenarioApiKey, scenarioApiSecret).then((d: any) => {
      if (d.success && d.models) setModels(d.models);
    }).catch(() => {}).finally(() => setLoadingModels(false));
  }, [scenarioApiKey, scenarioApiSecret]);

  const validKeys = geminiKeys.filter(k => k.valid).map(k => k.key);
  const imageModels = models.filter(m => m.capabilities?.some((c: string) => c === 'txt2img' || c === 'img2img'));
  const videoModels = models.filter(m => m.capabilities?.some((c: string) => c === 'txt2video' || c === 'img2video'));

  // Poll a job and update state
  const pollScene = useCallback((jobId: string, setter: (fn: (prev: Record<number, SceneJob>) => Record<number, SceneJob>) => void, idx: number) => {
    const interval = setInterval(async () => {
      try {
        const d = await pollJobApi(jobId, scenarioApiKey, scenarioApiSecret);
        if (!d.success || !d.job) return;
        setter(prev => ({ ...prev, [idx]: { jobId, status: d.job!.status, progress: d.job!.progress } }));
        if (d.job.status === 'success' || d.job.status === 'failed' || d.job.status === 'canceled') {
          clearInterval(interval);
          if (d.job.status === 'failed') setter(prev => ({ ...prev, [idx]: { jobId, status: 'failed', progress: 0, error: d.job!.error || 'Failed' } }));
        }
      } catch {}
    }, POLL_MS);
    // Initial poll
    pollJobApi(jobId, scenarioApiKey, scenarioApiSecret).then(d => {
      if (d.success && d.job) setter(prev => ({ ...prev, [idx]: { jobId, status: d.job!.status, progress: d.job!.progress } }));
    });
  }, [scenarioApiKey, scenarioApiSecret]);

  // Step 1: Generate background prompts
  const handleGenBgPrompts = async () => {
    if (!productData) return;
    setIsGeneratingPrompts(true); setError(null); setBgPrompts([]);
    const data = await generatePrompts({
      product: productData, selectedImages, mode: 'image',
      geminiKeys: validKeys, geminiModel,
    });
    if (!data.success) setError(data.error || 'Failed');
    else setBgPrompts(data.prompts ?? []);
    setIsGeneratingPrompts(false);
  };

  // Step 2: Generate background-replaced images (Photoroom or Gemini)
  const handleGenBg = async (idx: number) => {
    const prompt = bgPrompts[idx]; if (!prompt) return;
    const refImg = selectedImages[idx % selectedImages.length] || selectedImages[0];
    setBgJobs(prev => ({ ...prev, [idx]: { jobId: '', status: 'starting', progress: 0 } }));
    addLog('info', `BG Replace scene ${idx + 1}`);

    const data = await generateImage({
      prompt: `Place this exact product in a new scene: ${prompt}. Keep the product EXACTLY as shown - same colors, shape, label, design. Only change the background/environment.`,
      referenceImages: [refImg],
      modelId: imageModel,
      numOutputs: 1, width: 1080, height: 1920,
      scenarioApiKey, scenarioApiSecret,
    });

    if (!data.success) {
      setBgJobs(prev => ({ ...prev, [idx]: { jobId: '', status: 'failed', progress: 0, error: data.error } }));
      return;
    }
    setBgJobs(prev => ({ ...prev, [idx]: { jobId: data.jobId!, status: 'queued', progress: 0 } }));
    pollScene(data.jobId!, setBgJobs, idx);
  };

  const handleGenAllBg = () => { bgPrompts.forEach((_, i) => setTimeout(() => handleGenBg(i), i * 600)); };

  // Step 3: Compose with character (Gemini)
  const handleGenComposePrompts = async () => {
    if (!productData) return;
    setIsGeneratingPrompts(true); setError(null); setComposePrompts([]);
    let charB64: string | undefined, charMime: string | undefined;
    if (characterImage) { const m = characterImage.match(/^data:(image\/[^;]+);base64,(.+)$/); if (m) { charMime = m[1]; charB64 = m[2]; } }
    const data = await generatePrompts({
      product: productData, selectedImages: bgResults.length > 0 ? bgResults : selectedImages,
      mode: 'image', geminiKeys: validKeys, geminiModel,
      characterImageBase64: charB64, characterImageMime: charMime,
    });
    if (!data.success) setError(data.error || 'Failed');
    else setComposePrompts(data.prompts ?? []);
    setIsGeneratingPrompts(false);
  };

  const handleGenCompose = async (idx: number) => {
    const prompt = composePrompts[idx]; if (!prompt) return;
    const refImgs = bgResults.length > 0 ? [bgResults[idx % bgResults.length]] : [selectedImages[0]];
    setComposeJobs(prev => ({ ...prev, [idx]: { jobId: '', status: 'starting', progress: 0 } }));
    addLog('info', `Compose scene ${idx + 1} with character`);

    const data = await generateImage({
      prompt, referenceImages: refImgs,
      modelId: 'model_google-gemini-pro-image-editing',
      numOutputs: 1, width: 1080, height: 1920,
      scenarioApiKey, scenarioApiSecret,
    });

    if (!data.success) {
      setComposeJobs(prev => ({ ...prev, [idx]: { jobId: '', status: 'failed', progress: 0, error: data.error } }));
      return;
    }
    setComposeJobs(prev => ({ ...prev, [idx]: { jobId: data.jobId!, status: 'queued', progress: 0 } }));
    pollScene(data.jobId!, setComposeJobs, idx);
  };

  const handleGenAllCompose = () => { composePrompts.forEach((_, i) => setTimeout(() => handleGenCompose(i), i * 600)); };

  // Step 4: Generate video from composed images
  const handleGenVideo = async (idx: number) => {
    const img = selectedForVideo[idx]; if (!img) return;
    setVideoJobs(prev => ({ ...prev, [idx]: { jobId: '', status: 'starting', progress: 0 } }));
    addLog('info', `Video from image ${idx + 1}`);

    const data = await generateVideo({
      prompt: `Animate this UGC scene into a natural, authentic ${videoDuration}-second vertical video. The person interacts with the product naturally. Smooth camera movement, realistic motion.`,
      referenceImages: [img], modelId: videoModel,
      duration: videoDuration, aspectRatio: '9:16',
      scenarioApiKey, scenarioApiSecret,
    });

    if (!data.success) {
      setVideoJobs(prev => ({ ...prev, [idx]: { jobId: '', status: 'failed', progress: 0, error: data.error } }));
      return;
    }
    setVideoJobs(prev => ({ ...prev, [idx]: { jobId: data.jobId!, status: 'queued', progress: 0 } }));
    pollScene(data.jobId!, setVideoJobs, idx);
  };

  const handleGenAllVideos = () => { selectedForVideo.forEach((_, i) => setTimeout(() => handleGenVideo(i), i * 600)); };

  if (!productData) return null;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">UGC Studio</h1>
          <p className="text-xs text-zinc-400 mt-0.5">{productData.title.slice(0, 50)}...</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedImages[0] && <img src={selectedImages[0]} alt="" className="w-8 h-8 rounded-lg object-cover border border-zinc-700" />}
          {characterImage && <img src={characterImage} alt="" className="w-8 h-8 rounded-lg object-cover border border-indigo-500/50" />}
        </div>
      </div>

      {/* Pipeline tabs */}
      <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
        {[
          { id: 'setup', icon: Wand2, label: 'Setup' },
          { id: 'background', icon: Layers, label: 'Background' },
          { id: 'compose', icon: Camera, label: 'Compose' },
          { id: 'video', icon: Video, label: 'Video' },
        ].map(t => (
          <button key={t.id} onClick={() => setPipeline(t.id as any)}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${pipeline === t.id ? 'bg-accent text-white shadow-lg' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {/* SETUP */}
      {pipeline === 'setup' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-surface p-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-200">Image Generation Model</h3>
            <select value={imageModel} onChange={e => setImageModel(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-sm">
              {imageModels.map(m => <option key={m.id} value={m.id}>{m.name} {m.access === 0 ? '✅' : m.access === 25 ? '⚡' : '👑'}</option>)}
            </select>
            <h3 className="text-sm font-semibold text-zinc-200 pt-2">Video Generation Model</h3>
            <select value={videoModel} onChange={e => setVideoModel(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-sm">
              {videoModels.map(m => <option key={m.id} value={m.id}>{m.name} {m.access === 0 ? '✅' : m.access === 25 ? '⚡' : '👑'}</option>)}
            </select>
            <div className="space-y-2 pt-2">
              <h3 className="text-sm font-semibold text-zinc-200">Video Duration</h3>
              <div className="grid grid-cols-4 gap-2">
                {VIDEO_DURATIONS.map(d => (
                  <button key={d} onClick={() => setVideoDuration(d)} className={`py-2.5 rounded-lg text-sm font-semibold ${videoDuration === d ? 'bg-accent text-white' : 'bg-bg border border-zinc-700 text-zinc-300'}`}>{d}s</button>
                ))}
              </div>
            </div>
            {!characterImage && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                ⚠️ No character selected. <button onClick={() => navigate('/character')} className="underline font-medium">Go to Characters tab</button> to create one for consistent UGC.
              </div>
            )}
          </div>
          <button onClick={() => setPipeline('background')} disabled={!scenarioKeyValid}
            className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            Start Pipeline <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* BACKGROUND REPLACE */}
      {pipeline === 'background' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">Step 1: Product Background</h3>
                <p className="text-[10px] text-zinc-500 mt-0.5">Generate new backgrounds for your product. Product stays 100% unchanged.</p>
              </div>
              {bgPrompts.length > 0 && (
                <button onClick={handleGenAllBg} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium">
                  <Zap className="w-3.5 h-3.5" />Generate All
                </button>
              )}
            </div>
            <button onClick={handleGenBgPrompts} disabled={isGeneratingPrompts}
              className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
              {isGeneratingPrompts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {bgPrompts.length > 0 ? 'Regenerate' : 'Generate Background Prompts'}
            </button>
          </div>

          {bgPrompts.map((p, i) => {
            const job = bgJobs[i];
            const running = job && ['queued', 'processing', 'starting'].includes(job.status);
            const done = job?.status === 'success';
            return (
              <div key={i} className={`rounded-xl border p-4 space-y-2 ${done ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-zinc-800 bg-surface'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-zinc-500">BG SCENE {i + 1}</span>
                  {running && <span className="text-[10px] text-accent flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />{Math.round((job.progress || 0) * 100)}%</span>}
                  {done && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                </div>
                <div className="flex gap-2">
                  <img src={selectedImages[i % selectedImages.length] || selectedImages[0]} alt="" className="w-14 h-14 rounded-lg object-cover border border-zinc-700 shrink-0" />
                  <textarea value={p} onChange={e => { const u = [...bgPrompts]; u[i] = e.target.value; setBgPrompts(u); }} rows={2}
                    className="flex-1 px-3 py-2 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-[11px] resize-y" />
                </div>
                {running && <div className="w-full h-1 rounded-full bg-zinc-800"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max((job.progress || 0) * 100, 5)}%` }} /></div>}
                {!running && <button onClick={() => handleGenBg(i)} className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center justify-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />{done ? 'Regenerate' : 'Generate'}
                </button>}
                {job?.error && <p className="text-[10px] text-red-400">{job.error}</p>}
              </div>
            );
          })}

          {bgResults.length > 0 && (
            <button onClick={() => setPipeline('compose')} className="w-full py-3 rounded-xl bg-accent text-white font-medium text-sm flex items-center justify-center gap-2">
              Next: Compose with Character <ArrowRight className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setPipeline('compose')} className="w-full py-2 rounded-lg border border-zinc-700 text-zinc-400 text-xs hover:text-zinc-200">
            Skip → Go to Compose (use original product images)
          </button>
        </div>
      )}

      {/* COMPOSE WITH CHARACTER */}
      {pipeline === 'compose' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">Step 2: Compose Scene</h3>
                <p className="text-[10px] text-zinc-500 mt-0.5">Combine product + character into UGC scenes using Gemini AI.</p>
              </div>
              {composePrompts.length > 0 && (
                <button onClick={handleGenAllCompose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium">
                  <Zap className="w-3.5 h-3.5" />Generate All
                </button>
              )}
            </div>
            {characterImage && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                <img src={characterImage} alt="" className="w-8 h-8 rounded-lg object-cover" />
                <span className="text-[10px] text-indigo-300 font-medium">Character will be included in composition</span>
              </div>
            )}
            <button onClick={handleGenComposePrompts} disabled={isGeneratingPrompts}
              className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
              {isGeneratingPrompts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {composePrompts.length > 0 ? 'Regenerate' : 'Generate Compose Prompts'}
            </button>
          </div>

          {composePrompts.map((p, i) => {
            const job = composeJobs[i];
            const running = job && ['queued', 'processing', 'starting'].includes(job.status);
            const done = job?.status === 'success';
            return (
              <div key={i} className={`rounded-xl border p-4 space-y-2 ${done ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-zinc-800 bg-surface'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-zinc-500">COMPOSE {i + 1}</span>
                  {running && <span className="text-[10px] text-accent flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />{Math.round((job.progress || 0) * 100)}%</span>}
                  {done && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                </div>
                <textarea value={p} onChange={e => { const u = [...composePrompts]; u[i] = e.target.value; setComposePrompts(u); }} rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-[11px] resize-y" />
                {running && <div className="w-full h-1 rounded-full bg-zinc-800"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max((job.progress || 0) * 100, 5)}%` }} /></div>}
                {!running && <button onClick={() => handleGenCompose(i)} className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center justify-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />{done ? 'Regenerate' : 'Generate'}
                </button>}
              </div>
            );
          })}

          {composeResults.length > 0 && (
            <button onClick={() => setPipeline('video')} className="w-full py-3 rounded-xl bg-accent text-white font-medium text-sm flex items-center justify-center gap-2">
              Next: Generate Video <ArrowRight className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setPipeline('video')} className="w-full py-2 rounded-lg border border-zinc-700 text-zinc-400 text-xs hover:text-zinc-200">
            Skip → Go to Video (use available images)
          </button>
        </div>
      )}

      {/* VIDEO */}
      {pipeline === 'video' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-surface p-4 space-y-3">
            <h3 className="text-sm font-semibold text-zinc-200">Step 3: Generate Video</h3>
            <p className="text-[10px] text-zinc-500">Select images to animate into {videoDuration}s vertical videos.</p>
            
            {/* Image selection for video */}
            <div className="space-y-2">
              <label className="text-[10px] font-medium text-zinc-400">Select images to animate:</label>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {[...composeResults, ...bgResults, ...selectedImages.slice(0, 3)].filter(Boolean).map((url, i) => {
                  const sel = selectedForVideo.includes(url);
                  return (
                    <button key={i} onClick={() => setSelectedForVideo(prev => sel ? prev.filter(u => u !== url) : [...prev, url])}
                      className={`relative aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all ${sel ? 'border-accent ring-1 ring-accent/30' : 'border-zinc-700 opacity-50 hover:opacity-100'}`}>
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      {sel && <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-white" /></div>}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedForVideo.length > 0 && (
              <button onClick={handleGenAllVideos}
                className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium flex items-center justify-center gap-2">
                <Video className="w-4 h-4" />Generate {selectedForVideo.length} Video{selectedForVideo.length > 1 ? 's' : ''} ({videoDuration}s each)
              </button>
            )}
          </div>

          {/* Video jobs */}
          {Object.entries(videoJobs).map(([idx, job]) => (
            <div key={idx} className={`rounded-xl border p-3 ${job.status === 'success' ? 'border-emerald-500/30' : 'border-zinc-800'} bg-surface`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-500">VIDEO {Number(idx) + 1}</span>
                {['queued', 'processing', 'starting'].includes(job.status) && <span className="text-[10px] text-accent flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />{Math.round(job.progress * 100)}%</span>}
                {job.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {job.status === 'failed' && <span className="text-[10px] text-red-400">{job.error}</span>}
              </div>
              {['queued', 'processing'].includes(job.status) && <div className="w-full h-1 rounded-full bg-zinc-800 mt-2"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(job.progress * 100, 5)}%` }} /></div>}
            </div>
          ))}

          {Object.values(videoJobs).some(j => j.status === 'success') && (
            <button onClick={() => navigate('/gallery')} className="w-full py-3 rounded-xl bg-emerald-600 text-white font-medium text-sm flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" />View in Gallery
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-[10px] text-red-300 underline">Dismiss</button>
        </div>
      )}
    </div>
  );
}
