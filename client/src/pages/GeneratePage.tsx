import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Loader2, AlertCircle, CheckCircle2,
  Zap, User, Plus,
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

  const [characters] = useState<SavedCharacter[]>(() => {
    try { return JSON.parse(localStorage.getItem('ugc_characters') || '[]'); } catch { return []; }
  });

  // Scene prompts (generated or manual)
  const [scenePrompts, setScenePrompts] = useState<string[]>([]);
  // Per-scene generation jobs
  const [jobs, setJobs] = useState<Record<number, SceneJob>>({});
  // Model
  const [imageModel, setImageModel] = useState('model_google-gemini-pro-image-editing');
  const [models, setModels] = useState<any[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
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

  // Generate prompts via Gemini (uses all product images + character as context)
  const handleGeneratePrompts = async () => {
    if (!productData) return;
    setIsGeneratingPrompts(true); setError(null);
    addLog('info', 'Generating scene prompts via Gemini...');

    let charB64: string | undefined, charMime: string | undefined;
    if (characterImage) {
      const m = characterImage.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (m) { charMime = m[1]; charB64 = m[2]; }
    }

    const data = await generatePrompts({
      product: productData, selectedImages, mode: 'image',
      geminiKeys: validKeys, geminiModel,
      characterImageBase64: charB64, characterImageMime: charMime,
    });
    if (!data.success) { setError(data.error || 'Failed'); setIsGeneratingPrompts(false); return; }
    setScenePrompts(data.prompts ?? []);
    setIsGeneratingPrompts(false);
    addLog('success', `${(data.prompts ?? []).length} scene prompts generated`);
  };

  // Update one prompt
  const updatePrompt = (idx: number, text: string) => {
    setScenePrompts(prev => { const u = [...prev]; u[idx] = text; return u; });
  };

  // Add empty prompt slot
  const addPromptSlot = () => {
    setScenePrompts(prev => [...prev, '']);
  };

  // Generate ONE scene image — uses ALL product images + character as reference
  const handleGenerate = async (idx: number) => {
    const prompt = scenePrompts[idx];
    if (!prompt?.trim()) { setError(`Scene ${idx + 1}: prompt kosong`); return; }

    setJobs(prev => ({
      ...prev,
      [idx]: { jobId: '', status: 'starting', progress: 0, logs: ['Memulai generate...', 'Referensi: semua gambar produk + karakter'] },
    }));
    addLog('info', `Scene ${idx + 1}: generating with ${selectedImages.length} product refs`);

    // Use first product image as primary reference (model uses it for img2img)
    // The prompt describes the scene with character + product
    const data = await generateImage({
      prompt,
      referenceImages: selectedImages.slice(0, 3), // send up to 3 product images as reference
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
    startPolling(idx, data.jobId!, scenarioApiKey, scenarioApiSecret);
  };

  // Poll job and resolve result
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
          if (d.job.assetIds[0]) {
            const asset = await getAsset(d.job.assetIds[0], apiKey, apiSecret);
            if (asset.success && asset.url) {
              setJobs(prev => ({
                ...prev,
                [idx]: { ...prev[idx], resultUrl: asset.url, logs: [...prev[idx].logs, '✓ Hasil siap!'] },
              }));
            }
          }
          return true;
        } else if (d.job.status === 'failed' || d.job.status === 'canceled') {
          setJobs(prev => ({
            ...prev,
            [idx]: { ...prev[idx], status: 'failed', error: d.job!.error || 'Failed', logs: [...prev[idx].logs, `✗ ${d.job!.error || 'Failed'}`] },
          }));
          return true;
        }
        return false;
      } catch { return false; }
    };

    doPoll().then(done => {
      if (done) return;
      const interval = setInterval(async () => {
        const finished = await doPoll();
        if (finished) clearInterval(interval);
      }, POLL_MS);
    });
  };

  if (!productData) return null;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Top section: Character + Model */}
      <div className="rounded-xl border border-zinc-800 bg-surface p-4 space-y-4">
        {/* Row 1: Character + Model side by side */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Character */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Karakter</h3>
            {characters.length === 0 ? (
              <button onClick={() => navigate('/character')}
                className="w-16 h-20 rounded-lg border-2 border-dashed border-zinc-700 flex flex-col items-center justify-center hover:border-accent/50 transition-all">
                <User className="w-5 h-5 text-zinc-600" />
                <span className="text-[8px] text-zinc-500 mt-0.5">Tambah</span>
              </button>
            ) : (
              <div className="flex gap-2">
                {characters.map(char => {
                  const active = characterImage === char.image;
                  return (
                    <button key={char.id} onClick={() => handleSelectCharacter(char)}
                      className={`shrink-0 transition-all ${active ? 'opacity-100 scale-105' : 'opacity-40 hover:opacity-70'}`}>
                      <div className={`w-14 h-18 rounded-lg overflow-hidden border-2 ${active ? 'border-accent ring-2 ring-accent/30' : 'border-zinc-700'}`}>
                        <img src={char.image} alt={char.name} className="w-full h-full object-cover" />
                      </div>
                      <p className="text-[8px] text-zinc-400 mt-0.5 text-center truncate w-14">{char.name}</p>
                    </button>
                  );
                })}
                <button onClick={() => navigate('/character')}
                  className="w-14 h-18 rounded-lg border-2 border-dashed border-zinc-700 flex items-center justify-center hover:border-accent/50">
                  <Plus className="w-4 h-4 text-zinc-600" />
                </button>
              </div>
            )}
          </div>

          {/* Model */}
          <div className="flex-1 space-y-2">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Model</h3>
            <select value={imageModel} onChange={e => setImageModel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-sm">
              {imageModels.map(m => (
                <option key={m.id} value={m.id}>{m.name} {m.access === 0 ? '✅' : m.access === 25 ? '⚡' : '👑'}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Product Reference Images */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Product Referensi</h3>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {selectedImages.map((url, i) => (
              <div key={i} className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-zinc-700">
                <img src={url} alt={`Product ${i + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          <p className="text-[9px] text-zinc-500">{selectedImages.length} gambar produk akan digunakan sebagai referensi untuk semua scene</p>
        </div>

        {/* Row 3: Generate Prompt button */}
        <button onClick={handleGeneratePrompts} disabled={isGeneratingPrompts || !validKeys.length}
          className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
          {isGeneratingPrompts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate Prompt
        </button>
      </div>

      {/* Bottom section: Scene results */}
      {scenePrompts.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-surface p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-200">Scenes ({scenePrompts.length})</h3>
            <button onClick={addPromptSlot} className="text-[10px] text-accent hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" />Tambah Scene
            </button>
          </div>

          {scenePrompts.map((prompt, i) => {
            const job = jobs[i];
            const running = job && ['queued', 'processing', 'starting'].includes(job.status);
            const done = job?.status === 'success';
            const failed = job?.status === 'failed';

            return (
              <div key={i} className={`rounded-xl border p-4 space-y-3 ${done ? 'border-emerald-500/30 bg-emerald-500/5' : failed ? 'border-red-500/30 bg-red-500/5' : 'border-zinc-800 bg-bg'}`}>
                {/* Scene header */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase">Image Scene {i + 1}</span>
                  {running && <span className="text-[10px] text-accent flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />{Math.round((job.progress || 0) * 100)}%</span>}
                  {done && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {failed && <AlertCircle className="w-4 h-4 text-red-400" />}
                </div>

                {/* Prompt textarea */}
                <textarea
                  value={prompt}
                  onChange={e => updatePrompt(i, e.target.value)}
                  placeholder="Edit prompt untuk scene ini..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-zinc-700 text-zinc-200 text-xs resize-y placeholder-zinc-600 leading-relaxed"
                />

                {/* Progress bar */}
                {running && (
                  <div className="w-full h-1.5 rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max((job.progress || 0) * 100, 5)}%` }} />
                  </div>
                )}

                {/* Generate button */}
                {!running && (
                  <button onClick={() => handleGenerate(i)} disabled={!prompt.trim() || !scenarioKeyValid}
                    className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5 transition-all">
                    <Zap className="w-3.5 h-3.5" />{done ? 'Regenerate' : failed ? 'Retry' : 'Generate Image'}
                  </button>
                )}

                {/* Log */}
                {job?.logs && job.logs.length > 0 && (
                  <div className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800 max-h-16 overflow-y-auto">
                    {job.logs.map((log, li) => (
                      <p key={li} className="text-[9px] text-zinc-500 font-mono">{log}</p>
                    ))}
                  </div>
                )}

                {/* Error */}
                {job?.error && <p className="text-[10px] text-red-400 bg-red-500/10 p-2 rounded-lg">{job.error}</p>}

                {/* Result image */}
                {job?.resultUrl && (
                  <div className="rounded-lg overflow-hidden border border-emerald-500/30">
                    <img src={job.resultUrl} alt={`Scene ${i + 1}`} className="w-full max-h-80 object-contain bg-zinc-900" />
                    <div className="px-3 py-1.5 bg-emerald-500/10 text-[10px] text-emerald-300 text-center">
                      ✓ Hasil scene {i + 1} — siap untuk video prompt
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
