import { ScenarioClient } from './client';
import type { JobStatus } from '../../../shared/src/types';

export interface PollJobParams {
  apiKey: string;
  apiSecret: string;
  jobId: string;
  /** Polling interval in milliseconds. Default: 10000 (10s) */
  intervalMs?: number;
  /** Timeout in milliseconds. Default: 300000 (5 min for images). Use 1200000 (20 min) for videos. */
  timeoutMs?: number;
  /** Called on each poll with the current job status */
  onProgress?: (status: JobStatus) => void;
}

const TERMINAL_STATUSES: JobStatus['status'][] = ['success', 'failed', 'canceled'];

/**
 * Polls a Scenario API job until it reaches a terminal status or times out.
 *
 * - Default interval: 10s
 * - Default timeout: 5 minutes (images). Caller should pass 1200000ms for videos.
 * - Calls onProgress on each poll with the current status.
 * - Returns the final JobStatus when terminal.
 * - Throws an error if the timeout is exceeded.
 */
export async function pollJob(params: PollJobParams): Promise<JobStatus> {
  const {
    apiKey,
    apiSecret,
    jobId,
    intervalMs = 10000,
    timeoutMs = 300000,
    onProgress,
  } = params;

  const client = new ScenarioClient(apiKey, apiSecret);
  const startTime = Date.now();

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      throw new Error(
        `Job ${jobId} timed out after ${Math.round(timeoutMs / 1000)}s`
      );
    }

    const status = await client.getJob(jobId);

    if (onProgress) {
      onProgress(status);
    }

    if (TERMINAL_STATUSES.includes(status.status)) {
      return status;
    }

    await delay(intervalMs);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
