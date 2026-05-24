import { useEffect, useRef } from 'react';
import { getJob } from '../api/client.js';

/**
 * Poll a job's status until it reaches a terminal state.
 *
 * @param {string|null} jobId    Job id to poll, or null to pause
 * @param {boolean}     active   When false, stops polling (e.g. job already terminal)
 * @param {function}    onUpdate Called with the job payload on each successful poll
 * @param {function}    onError  Called with an Error on poll failure
 *
 * Backoff: starts at 1s, multiplies by 1.4 up to 5s. Active jobs get tight
 * updates; long-running waits don't hammer the server. The exact polling
 * interval matters when many tabs are open — avoids a thundering herd.
 *
 * On unmount or when active flips false, the timer is cleared and any in-flight
 * fetch is ignored (cancelled flag prevents setState-after-unmount warnings).
 */
export function useJobPolling(jobId, active, onUpdate, onError) {
  const updateRef = useRef(onUpdate);
  const errorRef  = useRef(onError);
  updateRef.current = onUpdate;
  errorRef.current  = onError;

  useEffect(() => {
    if (!jobId || !active) return undefined;

    let cancelled = false;
    let timer = null;
    let interval = 1000;
    const maxInterval = 5000;
    const growth = 1.4;

    async function tick() {
      try {
        const data = await getJob(jobId);
        if (cancelled) return;
        updateRef.current?.(data);

        // Stop polling once we hit a terminal state.
        if (data.status === 'completed' || data.status === 'failed') return;

        interval = Math.min(maxInterval, interval * growth);
        timer = setTimeout(tick, interval);
      } catch (err) {
        if (cancelled) return;
        errorRef.current?.(err);
        // On transient errors, keep trying — converted to give-up after a while
        // would be a UX regression (user thinks job is broken when network blipped).
        timer = setTimeout(tick, maxInterval);
      }
    }

    // First tick is immediate so the UI updates fast after upload completes.
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, active]);
}