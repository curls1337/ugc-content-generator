import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ImageOff, ArrowRight, CheckSquare, XSquare } from 'lucide-react';
import { useAppStore } from '../store';

export default function SelectImagesPage() {
  const navigate = useNavigate();

  const {
    productData,
    selectedImages,
    toggleImageSelection,
    setSelectedImages,
  } = useAppStore();

  // Redirect to home if no product data
  useEffect(() => {
    if (!productData) {
      navigate('/', { replace: true });
    }
  }, [productData, navigate]);

  if (!productData) {
    return null;
  }

  const images = productData.images.slice(0, 10);
  const selectedCount = selectedImages.length;
  const hasNoImages = images.length === 0;

  const handleSelectAll = () => {
    setSelectedImages(images);
  };

  const handleClear = () => {
    // Keep at least 1 image selected
    if (images.length > 0) {
      setSelectedImages([images[0]]);
    }
  };

  const handleContinue = () => {
    navigate('/generate');
  };

  // Error state: no images found
  if (hasNoImages) {
    return (
      <div className="flex items-center justify-center min-h-full p-4 sm:p-6">
        <div className="w-full max-w-md text-center">
          <div className="rounded-xl border border-zinc-800 bg-surface p-8 shadow-lg">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
              <ImageOff className="w-8 h-8 text-red-400" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-100">No Images Found</h2>
            <p className="mt-2 text-sm text-zinc-400">
              The product page did not contain any images. Please try a different product URL.
            </p>
            <button
              onClick={() => navigate('/')}
              className="mt-6 px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-surface"
            >
              Back to Scraper
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-tight">
            Select Images
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Choose the product images you want to use for content generation.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Product Info Panel */}
          <div className="lg:w-80 xl:w-96 shrink-0">
            <div className="rounded-xl border border-zinc-800 bg-surface p-5 shadow-lg sticky top-6">
              <h2 className="text-lg font-semibold text-zinc-100 line-clamp-2">
                {productData.title}
              </h2>

              {productData.price && (
                <p className="mt-2 text-xl font-bold text-accent">
                  {productData.price}
                </p>
              )}

              {productData.rating && (
                <p className="mt-1 text-sm text-zinc-400">
                  Rating: <span className="text-yellow-400">{productData.rating}</span>
                </p>
              )}

              {productData.description && (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
                    Description
                  </p>
                  <p className="text-sm text-zinc-300 line-clamp-6 leading-relaxed">
                    {productData.description}
                  </p>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-zinc-800">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  Platform
                </p>
                <p className="mt-1 text-sm text-zinc-300 capitalize">
                  {productData.platform}
                </p>
              </div>
            </div>
          </div>

          {/* Image Selection Panel */}
          <div className="flex-1 min-w-0">
            <div className="rounded-xl border border-zinc-800 bg-surface p-5 shadow-lg">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-300">
                    {selectedCount} of {images.length} selected
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSelectAll}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50"
                    aria-label="Select all images"
                  >
                    <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
                    Select All
                  </button>
                  <button
                    onClick={handleClear}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50"
                    aria-label="Clear selection (keeps first image)"
                  >
                    <XSquare className="w-3.5 h-3.5" aria-hidden="true" />
                    Clear
                  </button>
                </div>
              </div>

              {/* Image Grid */}
              <div
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-5 gap-3"
                role="group"
                aria-label="Product images selection"
              >
                {images.map((imageUrl, index) => {
                  const isSelected = selectedImages.includes(imageUrl);
                  const isLastSelected = isSelected && selectedCount === 1;

                  return (
                    <button
                      key={imageUrl}
                      onClick={() => toggleImageSelection(imageUrl)}
                      disabled={isLastSelected}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-surface group ${
                        isSelected
                          ? 'border-accent shadow-md shadow-accent/20'
                          : 'border-zinc-700 opacity-50 hover:opacity-75'
                      } ${isLastSelected ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      aria-label={`Image ${index + 1}${isSelected ? ', selected' : ', not selected'}${isLastSelected ? ', cannot deselect last image' : ''}`}
                      aria-pressed={isSelected}
                      title={isLastSelected ? 'At least one image must be selected' : undefined}
                    >
                      <img
                        src={imageUrl}
                        alt={`Product image ${index + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />

                      {/* Checkmark overlay for selected images */}
                      {isSelected && (
                        <div className="absolute inset-0 bg-accent/20 flex items-center justify-center">
                          <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shadow-lg">
                            <Check className="w-4 h-4 text-white" aria-hidden="true" />
                          </div>
                        </div>
                      )}

                      {/* Hover effect */}
                      {!isLastSelected && (
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Continue Button */}
              <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-between">
                <p className="text-xs text-zinc-500">
                  {selectedCount === 0
                    ? 'Select at least one image to continue'
                    : `${selectedCount} image${selectedCount !== 1 ? 's' : ''} will be used for generation`}
                </p>
                <button
                  onClick={handleContinue}
                  disabled={selectedCount === 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-surface"
                  aria-label="Continue to generate content"
                >
                  Continue to Generate
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
