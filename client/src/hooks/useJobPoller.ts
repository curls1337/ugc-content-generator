import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { pollJob, getAsset } from '../api/client';
import { addLog } from '../components/LogPanel';
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
        addLog('info', `Polling job ${activeJobId.slice(0, 12)}...`);
        const data = await pollJob(activeJobId, scenarioApiKey, scenarioApiSecret);

        if (!data.success || !data.job) {
          addLog('error', `Poll failed: ${data.error || 'no job data'}`);
          return;
        }

        const job = data.job;
        addLog('info', `Status: ${job.status} | Progress: ${Math.round(job.progress * 100)}% | Assets: ${job.assetIds?.length || 0}`);
        setJobStatus(job);

        if (job.status === 'success' || job.status === 'failed' || job.status === 'canceled') {
          setIsGenerating(false);

          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }

          if (job.status === 'success') {
            addLog('success', `Job completed! AssetIds: ${JSON.stringify(job.assetIds)}`);
            try {
              let items: GeneratedContent[] = [];

              if (job.assetIds && job.assetIds.length > 0) {
                items = await Promise.all(
                  job.assetIds.map(async (assetId: string) => {
                    try {
                      addLog('info', `Fetching asset: ${assetId.slice(0, 20)}...`);
                      const asset = await getAsset(assetId, scenarioApiKey, scenarioApiSecret);
                      addLog('success', `Asset URL: ${asset.url?.slice(0, 50)}...`);
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
                    } catch (err) {
                      const isUrl = assetId.startsWith('http');
                      addLog('error', `Asset fetch failed for ${assetId.slice(0, 20)}, isUrl=${isUrl}`);
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
                items = items.filter((item) => item.url !== '');
              }

              if (items.length > 0) {
                const session: GenerationSession = {
                  id: activeJobId,
                  productTitle: productData?.title || 'Untitled',
                  mode,
                  items,
                  createdAt: Date.now(),
                };
                addSession(session);
                addLog('success', `Gallery session created with ${items.length} items`);
              } else {
                addLog('error', 'Job succeeded but no downloadable assets found');
              }
            } catch (err) {
              addLog('error', `Gallery session creation failed: ${err}`);
            }
          } else {
            addLog('error', `Job ended with status: ${job.status} | Error: ${job.error || 'none'}`);
          }
        }
      } catch (err) {
        addLog('error', `Poll network error: ${err}`);
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
