import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  Play,
  Pause,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Film,
  Image,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAppStore } from '../store';
import { sortSessionsDescending } from '@shared/utils/session-sorter';
import { truncatePrompt } from '@shared/utils/formatting';
import type { GeneratedContent, GenerationSession } from '@shared/types';

// --- VideoPlayer Component ---

function VideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (video) {
      setCurrentTime(video.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video) {
      setDuration(video.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (video) {
      const time = Number(e.target.value);
      video.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative group">
      <video
        ref={videoRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        className="w-full aspect-[9/16] object-cover rounded-lg bg-zinc-900"
        preload="metadata"
        playsInline
      />

      {/* Play/Pause overlay */}
      <button
        onClick={togglePlay}
        className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg focus:outline-none focus:opacity-100"
        aria-label={isPlaying ? 'Pause video' : 'Play video'}
      >
        {isPlaying ? (
          <Pause className="w-12 h-12 text-white drop-shadow-lg" />
        ) : (
          <Play className="w-12 h-12 text-white drop-shadow-lg" />
        )}
      </button>

      {/* Controls bar */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent rounded-b-lg">
        <div className="flex items-center gap-2">
          <button
            onClick={togglePlay}
            className="text-white p-1 hover:text-accent transition-colors focus:outline-none focus:ring-1 focus:ring-accent rounded"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1 rounded-full appearance-none cursor-pointer bg-zinc-600 accent-accent"
            aria-label="Seek video"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
            aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          />
          <span className="text-xs text-zinc-300 font-mono min-w-[4rem] text-right">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}

// --- PromptDisplay Component ---

function PromptDisplay({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = text.length > 200;

  return (
    <div className="mt-2">
      <p className="text-xs text-zinc-400 leading-relaxed">
        {expanded ? text : truncatePrompt(text)}
      </p>
      {needsTruncation && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors focus:outline-none focus:underline"
          aria-expanded={expanded}
          aria-label={expanded ? 'Show less prompt text' : 'Show more prompt text'}
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3 h-3" aria-hidden="true" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" aria-hidden="true" />
              Show more
            </>
          )}
        </button>
      )}
    </div>
  );
}

// --- ContentCard Component ---

function ContentCard({ item }: { item: GeneratedContent }) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    setDownloadError(null);
    setIsDownloading(true);

    try {
      const response = await fetch(item.url);
      if (!response.ok) {
        throw new Error(`Download failed (HTTP ${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Determine filename based on type
      const extension = item.type === 'video' ? 'mp4' : 'png';
      link.download = `ugc-${item.id}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : 'Download failed. Please try again.'
      );
    } finally {
      setIsDownloading(false);
    }
  }, [item]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-surface overflow-hidden flex flex-col">
      {/* Content display */}
      <div className="relative">
        {item.type === 'video' ? (
          <VideoPlayer src={item.url} />
        ) : (
          <img
            src={item.url}
            alt={`Generated ${item.type} content`}
            className="w-full aspect-[9/16] object-cover rounded-t-xl bg-zinc-900"
            loading="lazy"
          />
        )}

        {/* Type badge */}
        <div className="absolute top-2 left-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-xs text-zinc-200 font-medium">
            {item.type === 'video' ? (
              <Film className="w-3 h-3" aria-hidden="true" />
            ) : (
              <Image className="w-3 h-3" aria-hidden="true" />
            )}
            {item.type === 'video' ? 'Video' : 'Image'}
          </span>
        </div>
      </div>

      {/* Card body */}
      <div className="p-3 flex-1 flex flex-col">
        <PromptDisplay text={item.prompt} />

        {/* Download section */}
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-surface"
            aria-label={`Download ${item.type}`}
          >
            {isDownloading ? (
              <>
                <Download className="w-4 h-4 animate-pulse" aria-hidden="true" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" aria-hidden="true" />
                Download
              </>
            )}
          </button>

          {/* Download error with retry */}
          {downloadError && (
            <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-red-300">{downloadError}</p>
                <button
                  onClick={handleDownload}
                  className="mt-1 flex items-center gap-1 text-xs text-red-300 hover:text-red-200 transition-colors focus:outline-none focus:underline"
                >
                  <RefreshCw className="w-3 h-3" aria-hidden="true" />
                  Retry download
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- SessionGroup Component ---

function SessionGroup({ session }: { session: GenerationSession }) {
  const formattedDate = new Date(session.createdAt).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <section className="space-y-4" aria-label={`Generation session from ${formattedDate}`}>
      {/* Session header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">{session.productTitle}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{formattedDate}</p>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 text-xs text-zinc-400 font-medium">
          {session.mode === 'video' ? (
            <Film className="w-3 h-3" aria-hidden="true" />
          ) : (
            <Image className="w-3 h-3" aria-hidden="true" />
          )}
          {session.items.length} {session.mode === 'video' ? 'video' : 'image'}
          {session.items.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {session.items.map((item) => (
          <ContentCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

// --- EmptyState Component ---

function EmptyState() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
        <Sparkles className="w-8 h-8 text-zinc-500" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold text-zinc-200">No content yet</h2>
      <p className="mt-2 text-sm text-zinc-400 max-w-sm">
        Start by scraping a product and generating content. Your generated images and videos will appear here.
      </p>
      <button
        onClick={() => navigate('/generate')}
        className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-bg"
      >
        <Sparkles className="w-4 h-4" aria-hidden="true" />
        Generate Content
      </button>
    </div>
  );
}

// --- GalleryPage Component ---

export default function GalleryPage() {
  const { sessions } = useAppStore();
  const sortedSessions = sortSessionsDescending(sessions);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Content Gallery</h1>
        <p className="mt-1 text-sm text-zinc-400">
          View and download your generated content.
        </p>
      </div>

      {/* Content */}
      {sortedSessions.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-10">
          {sortedSessions.map((session) => (
            <SessionGroup key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
