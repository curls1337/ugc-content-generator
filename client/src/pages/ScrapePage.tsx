import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store';
import { detectPlatform } from '@shared/utils/platform-detection';
import { isValidUrl } from '@shared/utils/url-validator';
import { scrapeProduct } from '../api/client';
import type { Platform } from '@shared/types';

function PlatformBadge({ platform }: { platform: Platform }) {
  if (platform === 'unknown') return null;

  const config = platform === 'tokopedia'
    ? { label: 'Tokopedia', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' }
    : { label: 'Shopee', bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}
      aria-label={`Detected platform: ${config.label}`}
    >
      {config.label}
    </span>
  );
}

export default function ScrapePage() {
  const [url, setUrl] = useState('');
  const navigate = useNavigate();

  const {
    isScrapingLoading,
    scrapeError,
    setProductData,
    setSelectedImages,
    setScrapeLoading,
    setScrapeError,
  } = useAppStore();

  const detectedPlatform = useMemo(() => detectPlatform(url), [url]);

  const handleAnalyze = async () => {
    // Clear previous errors
    setScrapeError(null);

    // Validate URL
    const validation = isValidUrl(url.trim());
    if (!validation.valid) {
      setScrapeError(validation.error);
      return;
    }

    // Check platform support
    const platform = detectPlatform(url.trim());
    if (platform === 'unknown') {
      setScrapeError('Only Tokopedia and Shopee URLs are supported. Please enter a valid product URL from either platform.');
      return;
    }

    // Start scraping
    setScrapeLoading(true);

    try {
      const data = await scrapeProduct(url.trim());

      if (!data.success) {
        setScrapeError(data.error || 'Failed to scrape product data. Please try again.');
        return;
      }

      // Store product data
      setProductData(data.data!);

      // Pre-select all images (up to 10)
      const images = data.data!.images?.slice(0, 10) ?? [];
      setSelectedImages(images);

      // Navigate to image selection page
      navigate('/select');
    } catch (err) {
      setScrapeError(
        err instanceof Error
          ? `Network error: ${err.message}`
          : 'An unexpected error occurred. Please check your connection and try again.'
      );
    } finally {
      setScrapeLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isScrapingLoading) {
      handleAnalyze();
    }
  };

  return (
    <div className="flex items-center justify-center min-h-full p-4 sm:p-6">
      <div className="w-full max-w-xl">
        {/* Card with gradient accent bar */}
        <div className="relative rounded-xl border border-zinc-800 bg-surface overflow-hidden shadow-lg">
          {/* Gradient accent bar */}
          <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

          <div className="p-6 sm:p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-tight">
                Product Scraper
              </h1>
              <p className="mt-2 text-sm sm:text-base text-zinc-400">
                Paste a product URL to extract images and data for UGC content generation.
              </p>
            </div>

            {/* URL Input */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label htmlFor="product-url" className="text-sm font-medium text-zinc-300">
                  Product URL
                </label>
                <PlatformBadge platform={detectedPlatform} />
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                  <Search className="w-4.5 h-4.5 text-zinc-500" aria-hidden="true" />
                </div>
                <input
                  id="product-url"
                  type="url"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (scrapeError) setScrapeError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="https://www.tokopedia.com/... or https://shopee.co.id/..."
                  disabled={isScrapingLoading}
                  className="w-full pl-10 pr-4 py-3 sm:py-3.5 rounded-lg bg-bg border border-zinc-700 text-zinc-100 placeholder-zinc-500 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-describedby={scrapeError ? 'scrape-error' : undefined}
                  autoComplete="url"
                />
              </div>
            </div>

            {/* Error display */}
            {scrapeError && (
              <div
                id="scrape-error"
                role="alert"
                className="mt-4 flex items-start gap-3 p-3.5 rounded-lg bg-red-500/10 border border-red-500/30"
              >
                <AlertCircle className="w-4.5 h-4.5 text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-sm text-red-300">{scrapeError}</p>
              </div>
            )}

            {/* Analyze button */}
            <button
              onClick={handleAnalyze}
              disabled={isScrapingLoading || !url.trim()}
              className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 sm:py-3.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm sm:text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-surface"
              aria-label={isScrapingLoading ? 'Analyzing product...' : 'Analyze product URL'}
            >
              {isScrapingLoading ? (
                <>
                  <Loader2 className="w-4.5 h-4.5 animate-spin" aria-hidden="true" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Search className="w-4.5 h-4.5" aria-hidden="true" />
                  <span>Analyze</span>
                </>
              )}
            </button>

            {/* Helper text */}
            <p className="mt-4 text-center text-xs text-zinc-500">
              Supports Tokopedia and Shopee product pages
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
