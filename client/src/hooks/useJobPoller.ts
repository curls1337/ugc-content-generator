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
    if (!activeJobId || !isGenerating) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    const poll = async () => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        const data = await pollJob(activeJobId, scenarioApiKey, scenarioApiSecret);

        if (!data.success || !data.job) {
          return;
        }

        const job = data.job;
        setJobStatus(job);

        if (job.status === 'success' || job.status === 'failed' || job.status === 'canceled') {
          setIsGenerating(false);

          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }

          // On success, create gallery session
          if (job.status === 'success') {
            try {
              let items: GeneratedContent[] = [];

              if (job.assetIds && job.assetIds.length > 0) {
                // Try to fetch each asset URL
                items = await Promise.all(
                  job.assetIds.map(async (assetId: string) => {
                    try {
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
                    } catch {
                      // If asset is actually a URL already (not an ID), use it directly
                      const isUrl = assetId.startsWith('http');
                      return {
                        id: assetId,
                        assetId,
                        type: mode,
                        url: isUrl ? assetId : '',
                        prompt: prompts[0] || '',
                        width: 1080,
                        height: 1920,
                        createdAt: Date.now(),
                      };
                    }
                  })
                );
                // Filter out items with no URL
                items = items.filter((item) => item.url !== '');
              }

              // If we got items, add session
              if (items.length > 0) {
                const session: GenerationSession = {
                  id: activeJobId,
                  productTitle: productData?.title || 'Untitled',
                  mode,
                  items,
                  createdAt: Date.now(),
                };
                addSession(session);
              } else {
                // No asset IDs but job succeeded — create a placeholder session
                // This can happen if the response format is different
                console.warn('[useJobPoller] Job succeeded but no assets found in response');
              }
            } catch (err) {
              console.error('[useJobPoller] Failed to create gallery session:', err);
            }
          }
        }
      } catch {
        // Network error — keep trying
      } finally {
        isPollingRef.current = false;
      }
    };

    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    poll();

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeJobId, isGenerating, scenarioApiKey, scenarioApiSecret, mode, prompts, productData, setJobStatus, setIsGenerating, addSession]);
}
