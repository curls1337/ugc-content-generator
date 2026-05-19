import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { pollJob, getAsset } from '../api/client';
import type { GeneratedContent, GenerationSession } from '@shared/types';

const POLL_INTERVAL_MS = 8000;

/**
 * Global job poller hook that runs at the App level.
 * Continues polling the active Scenario job regardless of which page the user is on.
 * On job success, fetches asset URLs and creates a GenerationSession in the gallery.
 */
export function useJobPoller(): void {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingRef = useRef(false);

  const activeJobId = useAppStore((s) => s.activeJobId);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const scenarioApiKey = useAppStore((s) => s.scenarioApiKey);
  const scenarioApiSecret = useAppStore((s) => s.scenarioApiSecret);
  const mode = useAppStore((s) => s.mode);
  const prompts = useAppStore((s) => s.prompts);
  const productData = useAppStore((s) => s.productData);
  const setJobStatus = useAppStore((s) => s.setJobStatus);
  const setIsGenerating = useAppStore((s) => s.setIsGenerating);
  const addSession = useAppStore((s) => s.addSession);

  useEffect(() => {
    // Only poll when there's an active job and generation is in progress
    if (!activeJobId || !isGenerating) {
      // Clean up any existing interval
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    const poll = async () => {
      // Prevent overlapping polls
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        const data = await pollJob(activeJobId, scenarioApiKey, scenarioApiSecret);

        if (!data.success || !data.job) {
          // Transient error — keep polling
          return;
        }

        const job = data.job;
        setJobStatus(job);

        // Check for terminal status
        if (job.status === 'success' || job.status === 'failed' || job.status === 'canceled') {
          setIsGenerating(false);

          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }

          // On success, create a gallery session from the generated assets
          if (job.status === 'success' && job.assetIds.length > 0) {
            try {
              const items: GeneratedContent[] = await Promise.all(
                job.assetIds.map(async (assetId) => {
                  const asset = await getAsset(assetId, scenarioApiKey, scenarioApiSecret);
                  return {
                    id: assetId,
                    assetId,
                    type: mode,
                    url: asset.url || '',
                    prompt: prompts[0] || '',
                    width: 1080,
                    height: 1920,
                    createdAt: Date.now(),
                  };
                })
              );

              const session: GenerationSession = {
                id: activeJobId,
                productTitle: productData?.title || 'Untitled',
                mode,
                items,
                createdAt: Date.now(),
              };

              addSession(session);
            } catch {
              // Asset fetch failed — session won't be added but job status is already updated
            }
          }
        }
      } catch {
        // Network error during polling — keep trying on next interval
      } finally {
        isPollingRef.current = false;
      }
    };

    // Start polling interval
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);

    // Also poll immediately on mount/activation
    poll();

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeJobId, isGenerating, scenarioApiKey, scenarioApiSecret, mode, prompts, productData, setJobStatus, setIsGenerating, addSession]);
}
