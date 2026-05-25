import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Loader2, AlertCircle, CheckCircle2,
  Zap, User, Plus, ImageIcon,
} from 'lucide-react';
import { useAppStore } from '../store';
import {
  generatePrompts, generateImage, pollJob as pollJobApi, getAsset, listModels,
} from '../api/client';
import { addLog } from '../components/LogPanel';

const POLL_MS = 6000;

interface SavedCharacter {
  id: string;
  name: string;
  image: string;
  description: string;
  createdAt: number;
}

type SceneJob = {
  jobId: string;
  status: string;
  progress: number;
  error?: string;
  resultUrl?: string;
  logs: string[];
};

export default function GeneratePage() {
  const navigate = useNavigate();

  // Characters from localStorage
  const [characters, setCharacters] = useState<SavedCharacter[]>(() => {
    try { return JSON.parse(localStorage.getItem('ugc_characters') || '[]'); } catch { return []; }
  });

  // Per-image prompts (user can edit each)
  const [prompts, setPrompts] = useState<Record<number, string>>({});
  // Per-image generation jobs
  const [jobs, setJobs] = useState<Record<number, SceneJob>>({});
  // Model selection
  const [imageModel, setImageModel] = useState('model_google-gemini-pro-image-editing');
  const [models, setModels] = useState<any[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  // Auto-prompt generation
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    productData, selectedImages, characterImage, setCharacterImage,
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

  // Select character
  const handleSelectCharacter = (char: SavedCharacter) => {
    setCharacterImage(char.image === characterImage ? null : char.image);
  };

  // Update prompt for a specific image
  const setPrompt = (idx: number, text: string) => {
    setPrompts(prev => ({ ...prev, [idx]: text }));
  };

  // Auto-generate prompts for all images via Gemini
  const handleAutoPrompts = async () => {
    if (!productData) return;
    setIsGeneratingPrompts(true); setError(null);
    addLog('info', 'Generating prompts via Gemini...');
    const data = await generatePrompts({
      product: productData, selectedImages, mode: 'image',
      geminiKeys: validKeys, geminiModel,
    });
    if (!data.success) { setError(data.error || 'Failed'); setIsGeneratingPrompts(false); return; }
    const generated = data.prompts ?? [];
    const newPrompts: Record<number, string> = {};
    selectedImages.forEach((_, i) => {
      newPrompts[i] = generated[i] || generated[0] || '';
    });
    setPrompts(newPrompts);
    setIsGeneratingPrompts(false);
  };

  // Generate ONE image (manual per-card)
  const handleGenerate = async (idx: number) => {
    const prompt = prompts[idx];
    if (!prompt?.trim()) { setError(`Scene ${idx + 1}: prompt kosong`); return; }
    const refImg = selectedImages[idx];

    // Set initial state with logs
    setJobs(prev => ({
      ...prev,
      [idx]: { jobId: '', status: 'starting', progress: 0, logs: ['Memulai generate...', 'Mengirim ke Scenario API...'] },
    }));
    addLog('info', `Scene ${idx + 1}: generating...`);

    const data = await generateImage({
      prompt: `${prompt}. Keep the product EXACTLY as shown in the reference image - same colors, shape, label, design.`,
      referenceImages: [refImg],
      modelId: imageModel,
      numOutputs: 1, width: 1080, height: 1920,
      scenarioApiKey, scenarioApiSecret,
    });

    if (!data.success) {
      setJobs(prev => ({
        ...prev,
        [idx]: { ...prev[idx], status: 'failed', error: data.error, logs: [...(prev[idx]?.logs || []), `✗ Error: ${data.error}`] },
      }));
      return;
    }

    setJobs(prev => ({
      ...prev,
      [idx]: { ...prev[idx], jobId: data.jobId!, status: 'processing', progress: 0.05, logs: [...(prev[idx]?.logs || []), `Job: ${data.jobId!.slice(0, 16)}... Polling...`] },
    }));

    // Start polling with credentials captured now
    startPolling(idx, data.jobId!, scenarioApiKey, scenarioApiSecret);
  };

  // Poll job and resolve result — immediate first poll + interval
  const startPolling = (idx: number, jobId: string, apiKey: string, apiSecret: string) => {
    const doPoll = async () => {
      try {
        const d = await pollJobApi(jobId, apiKey, apiSecret);
        if (!d.success || !d.job) return false;
        setJobs(prev => ({
          ...prev,
          [idx]: { ...prev[idx], status: d.job!.status, progress: d.job!.progress },
        }));
        if (d.job.status === 'success') {
          setJobs(prev => ({
            ...prev,
            [idx]: { ...prev[idx], logs: [...prev[idx].logs, '✓ Selesai! Mengambil hasil...'] },
          }));
          // Resolve asset URL
          if (d.job.assetIds[0]) {
            const asset = await getAsset(d.job.assetIds[0], apiKey, apiSecret);
            if (asset.success && asset.url) {
              setJobs(prev => ({
                ...prev,
                [idx]: { ...prev[idx], resultUrl: asset.url, logs: [...prev[idx].logs, '✓ Hasil siap!'] },
              }));
            }
          }
          return true; // done
        } else if (d.job.status === 'failed' || d.job.status === 'canceled') {
          setJobs(prev => ({
            ...prev,
            [idx]: { ...prev[idx], status: 'failed', error: d.job!.error || 'Failed', logs: [...prev[idx].logs, `✗ ${d.job!.error || 'Failed'}`] },
          }));
          return true; // done
        }
        return false; // keep polling
      } catch {
        return false;
      }
    };

    // Immediate first poll
    doPoll().then(done => {
      if (done) return;
      // Continue polling every POLL_MS
      const interval = setInterval(async () => {
        const finished = await doPoll();
        if (finished) clearInterval(interval);
      }, POLL_MS);
    });
  };

  if (!productData) return null;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Generate</h1>
        <p className="text-sm text-zinc-400 mt-0.5">{productData.title.slice(0, 60)}</p>
      </div>

      {/* Character Selection */}
      <div className="rounded-xl border border-zinc-800 bg-surface p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">Pilih Karakter</h3>
          <button onClick={() => navigate('/character')} className="text-[10px] text-accent hover:underline flex items-center gap-1">
            <Plus className="w-3 h-3" />Buat Baru
          </button>
        </div>

        {characters.length === 0 ? (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
            <User className="w-8 h-8 text-zinc-600" />
            <div>
              <p className="text-xs text-zinc-400">Belum ada karakter.</p>
              <button onClick={() => navigate('/character')} className="text-[10px] text-accent hover:underline">Buat karakter dulu →</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {characters.map(char => {
              const active = characterImage === char.image;
              return (
                <button key={char.id} onClick={() => handleSelectCharacter(char)}
                  className={`shrink-0 w-16 text-center transition-all ${active ? 'opacity-100' : 'opacity-50 hover:opacity-80'}`}>
                  <div className={`w-16 h-20 rounded-lg overflow-hidden border-2 ${active ? 'border-accent ring-2 ring-accent/30' : 'border-zinc-700'}`}>
                    <img src={char.image} alt={char.name} className="w-full h-full object-cover" />
                  </div>
                  <p className="text-[9px] text-zinc-300 mt-1 truncate">{char.name}</p>
                  {active && <p className="text-[8px] text-accent font-bold">ACTIVE</p>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Model selection (compact) */}
      <div className="rounded-xl border border-zinc-800 bg-surface p-4 space-y-2">
        <h3 className="text-sm font-semibold text-zinc-200">Model</h3>
        <select value={imageModel} onChange={e => setImageModel(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-sm">
          {imageModels.map(m => (
            <option key={m.id} value={m.id}>{m.name} {m.access === 0 ? '✅' : m.access === 25 ? '⚡' : '👑'}</option>
          ))}
        </select>
      </div>

      {/* Auto-generate prompts button */}
      <button onClick={handleAutoPrompts} disabled={isGeneratingPrompts || !validKeys.length}
        className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
        {isGeneratingPrompts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {Object.keys(prompts).length > 0 ? 'Re-generate Prompts (AI)' : 'Auto-Generate Prompts (AI)'}
      </button>

      {/* Image list with per-image prompt + generate */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-zinc-200">Gambar Produk ({selectedImages.length})</h3>

        {selectedImages.map((imgUrl, i) => {
          const job = jobs[i];
          const running = job && ['queued', 'processing', 'starting'].includes(job.status);
          const done = job?.status === 'success';
          const failed = job?.status === 'failed';
          const prompt = prompts[i] || '';

          return (
            <div key={i} className={`rounded-xl border p-4 space-y-3 ${done ? 'border-emerald-500/30 bg-emerald-500/5' : failed ? 'border-red-500/30 bg-red-500/5' : 'border-zinc-800 bg-surface'}`}>
              {/* Image + prompt */}
              <div className="flex gap-3">
                <img src={imgUrl} alt={`Product ${i + 1}`}
                  className="w-20 h-20 rounded-lg object-cover border border-zinc-700 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-zinc-500">SCENE {i + 1}</span>
                    {running && <span className="text-[10px] text-accent flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />{Math.round((job.progress || 0) * 100)}%</span>}
                    {done && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    {failed && <AlertCircle className="w-4 h-4 text-red-400" />}
                  </div>
                  <textarea
                    value={prompt}
                    onChange={e => setPrompt(i, e.target.value)}
                    placeholder="Tulis prompt untuk gambar ini... (atau klik Auto-Generate di atas)"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-[11px] resize-y placeholder-zinc-600"
                  />
                </div>
              </div>

              {/* Progress bar */}
              {running && (
                <div className="w-full h-1.5 rounded-full bg-zinc-800">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max((job.progress || 0) * 100, 5)}%` }} />
                </div>
              )}

              {/* Generate button */}
              {!running && (
                <button onClick={() => handleGenerate(i)} disabled={!prompt.trim() || !scenarioKeyValid}
                  className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-40 flex items-center justify-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />{done ? 'Regenerate' : failed ? 'Retry' : 'Generate'}
                </button>
              )}

              {/* Log proses */}
              {job?.logs && job.logs.length > 0 && (
                <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 max-h-20 overflow-y-auto">
                  {job.logs.map((log, li) => (
                    <p key={li} className="text-[9px] text-zinc-400 font-mono leading-relaxed">{log}</p>
                  ))}
                </div>
              )}

              {/* Error */}
              {job?.error && (
                <p className="text-[10px] text-red-400 bg-red-500/10 p-2 rounded-lg">{job.error}</p>
              )}

              {/* Result image */}
              {job?.resultUrl && (
                <div className="rounded-lg overflow-hidden border border-emerald-500/30">
                  <img src={job.resultUrl} alt={`Result ${i + 1}`} className="w-full max-h-72 object-contain bg-zinc-900" />
                  <div className="px-2 py-1 bg-emerald-500/10 text-[9px] text-emerald-300 text-center">
                    ✓ Hasil generate berhasil
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Error global */}
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
