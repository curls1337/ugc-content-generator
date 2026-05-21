import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, ArrowRight, User, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store';

export default function CharacterPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const { productData, selectedImages, characterImage, setCharacterImage, setCharacterAssetId } = useAppStore();

  useEffect(() => {
    if (!productData) {
      navigate('/', { replace: true });
    } else if (selectedImages.length === 0) {
      navigate('/select', { replace: true });
    }
  }, [productData, selectedImages, navigate]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    if (!file.type.startsWith('image/')) {
      setError('File harus berupa gambar (JPG, PNG, WebP)');
      return;
    }

    if (file.size > 6 * 1024 * 1024) {
      setError('Ukuran gambar maksimal 6MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCharacterImage(reader.result as string);
      setCharacterAssetId(null); // Reset asset ID when new image uploaded
    };
    reader.onerror = () => {
      setError('Gagal membaca file gambar');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveCharacter = () => {
    setCharacterImage(null);
    setCharacterAssetId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSkip = () => {
    setCharacterImage(null);
    setCharacterAssetId(null);
    navigate('/generate');
  };

  const handleContinue = () => {
    navigate('/generate');
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Upload Character</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Upload foto karakter/talent yang akan jadi model di video. Karakter akan dipakai sebagai referensi orang yang memegang/menggunakan produk. Bisa di-skip jika ingin AI generate karakter sendiri.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-surface p-6">
        {!characterImage ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-zinc-700 rounded-xl p-12 text-center cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-colors"
          >
            <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800 flex items-center justify-center mb-4">
              <Upload className="w-8 h-8 text-zinc-400" />
            </div>
            <p className="text-zinc-200 font-medium mb-1">Klik untuk upload foto karakter</p>
            <p className="text-xs text-zinc-500">JPG, PNG, WebP — maksimal 6MB</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative rounded-xl overflow-hidden bg-zinc-900 border border-zinc-700">
              <img
                src={characterImage}
                alt="Character"
                className="w-full h-auto max-h-96 object-contain"
              />
              <button
                onClick={handleRemoveCharacter}
                className="absolute top-3 right-3 w-9 h-9 rounded-full bg-red-500/90 hover:bg-red-500 text-white flex items-center justify-center shadow-lg"
                aria-label="Remove character"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <User className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-300">Karakter siap digunakan</p>
                <p className="text-xs text-emerald-400/80 mt-1">
                  Karakter ini akan dipakai sebagai referensi orang di prompt generation. Produk tetap akan terlihat sama persis seperti aslinya.
                </p>
              </div>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {error && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          onClick={handleSkip}
          className="px-5 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-800 transition-colors"
        >
          Skip (tanpa karakter)
        </button>
        <button
          onClick={handleContinue}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors"
        >
          Lanjut ke Generate
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
