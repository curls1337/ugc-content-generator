import { useState, useRef, useEffect } from 'react';
import { Upload, X, Plus, User, Trash2, Check, Loader2, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store';

interface SavedCharacter {
  id: string;
  name: string;
  image: string; // base64 data URL
  description: string;
  createdAt: number;
}

export default function CharacterPage() {
  const [characters, setCharacters] = useState<SavedCharacter[]>(() => {
    try { return JSON.parse(localStorage.getItem('ugc_characters') || '[]'); } catch { return []; }
  });
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newImage, setNewImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { characterImage, setCharacterImage } = useAppStore();

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('ugc_characters', JSON.stringify(characters));
  }, [characters]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) { setError('File harus gambar'); return; }
    if (file.size > 6 * 1024 * 1024) { setError('Max 6MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setNewImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!newImage || !newName.trim()) { setError('Nama dan foto wajib diisi'); return; }
    const char: SavedCharacter = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: newName.trim(),
      image: newImage,
      description: newDesc.trim() || 'No description',
      createdAt: Date.now(),
    };
    setCharacters(prev => [char, ...prev]);
    setNewName(''); setNewDesc(''); setNewImage(null); setShowCreate(false);
  };

  const handleDelete = (id: string) => {
    setCharacters(prev => prev.filter(c => c.id !== id));
    if (characters.find(c => c.id === id)?.image === characterImage) {
      setCharacterImage(null);
    }
  };

  const handleSelect = (char: SavedCharacter) => {
    setCharacterImage(char.image);
  };

  const isSelected = (char: SavedCharacter) => characterImage === char.image;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Characters</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Create and manage consistent characters for your UGC content</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all">
          <Plus className="w-4 h-4" />New Character
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-100">Create New Character</h2>
          <p className="text-xs text-zinc-400">Upload a clear photo of the person/character. For best consistency, use a well-lit front-facing photo with neutral background.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Photo upload */}
            <div>
              {!newImage ? (
                <div onClick={() => fileRef.current?.click()}
                  className="aspect-[3/4] rounded-xl border-2 border-dashed border-zinc-700 flex flex-col items-center justify-center cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-all">
                  <Upload className="w-10 h-10 text-zinc-500 mb-3" />
                  <p className="text-sm text-zinc-300 font-medium">Upload Photo</p>
                  <p className="text-[10px] text-zinc-500 mt-1">Clear, front-facing, well-lit</p>
                </div>
              ) : (
                <div className="relative aspect-[3/4] rounded-xl overflow-hidden border border-zinc-700">
                  <img src={newImage} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => { setNewImage(null); if (fileRef.current) fileRef.current.value = ''; }}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500/90 text-white flex items-center justify-center">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
            </div>

            {/* Details */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-300 mb-1 block">Character Name *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Sarah, Model A"
                  className="w-full px-3 py-2.5 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-sm placeholder-zinc-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-300 mb-1 block">Description (optional)</label>
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3}
                  placeholder="e.g. Young Indonesian woman, 25yo, hijab, casual style..."
                  className="w-full px-3 py-2.5 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-sm placeholder-zinc-500 resize-y" />
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                💡 Tips for consistent characters:<br/>
                • Use clear, high-resolution photo<br/>
                • Front-facing or 3/4 angle works best<br/>
                • Neutral/simple background<br/>
                • Good lighting on face<br/>
                • Same photo will be used as reference in all generations
              </p>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertCircle className="w-4 h-4 text-red-400" /><p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!newImage || !newName.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium disabled:opacity-50">
              <Check className="w-4 h-4" />Save Character
            </button>
            <button onClick={() => { setShowCreate(false); setNewImage(null); setNewName(''); setNewDesc(''); }}
              className="px-4 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800">Cancel</button>
          </div>
        </div>
      )}

      {/* Character grid */}
      {characters.length === 0 && !showCreate ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 mx-auto rounded-full bg-zinc-800 flex items-center justify-center mb-4">
            <User className="w-10 h-10 text-zinc-600" />
          </div>
          <h3 className="text-lg font-medium text-zinc-300">No characters yet</h3>
          <p className="text-sm text-zinc-500 mt-1 max-w-sm mx-auto">Create your first character to use as a consistent talent/model in your UGC content.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {characters.map(char => (
            <div key={char.id} className={`rounded-xl border overflow-hidden transition-all group ${isSelected(char) ? 'border-accent ring-2 ring-accent/30' : 'border-zinc-800 hover:border-zinc-600'}`}>
              <div className="aspect-[3/4] relative overflow-hidden bg-zinc-900">
                <img src={char.image} alt={char.name} className="w-full h-full object-cover" />
                {isSelected(char) && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-accent text-white text-[10px] font-bold">ACTIVE</div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                  <div className="flex gap-1.5 w-full">
                    <button onClick={() => handleSelect(char)}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold ${isSelected(char) ? 'bg-emerald-600 text-white' : 'bg-accent text-white'}`}>
                      {isSelected(char) ? '✓ Selected' : 'Use'}
                    </button>
                    <button onClick={() => handleDelete(char.id)}
                      className="px-2 py-1.5 rounded-lg bg-red-500/80 text-white">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-3">
                <h4 className="text-sm font-medium text-zinc-200 truncate">{char.name}</h4>
                <p className="text-[10px] text-zinc-500 truncate mt-0.5">{char.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
