import { Router } from 'express';
import crypto from 'crypto';
import { conversionQueue } from '../queue/queue.js';
import { config } from '../config/index.js';

const router = Router();

/**
 * GET /api/jobs/:id
 * Returns the current state of a conversion job. When complete, includes
 * a short-lived signed download token.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const jobId = String(req.params.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    if (!jobId) return res.status(400).json({ error: 'Invalid job id.' });

    const job = await conversionQueue.getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    const state = await job.getState();

    const response = {
      jobId,
      status: state,
      progress: typeof job.progress === 'number' ? job.progress : 0,
      sourceExt: job.data.sourceExt,
      targetExt: job.data.targetExt,
      displayName: job.data.displayName,
    };

    if (state === 'completed' && job.returnvalue) {
      const { outputFilename, outputSize } = job.returnvalue;
      response.outputSize = outputSize;
      response.downloadToken = signDownloadToken(jobId, outputFilename);
    }

    if (state === 'failed') {
      response.error = job.failedReason || 'Conversion failed.';
    }

    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * Build an HMAC-signed download token.
 * Format: base64url(JSON payload) + "." + hex(HMAC-SHA256 sig)
 *
 * Using JSON in the payload (instead of dot-delimited fields) avoids the
 * parsing ambiguity that occurs when fields themselves contain dots — e.g.
 * the output filename "<uuid>.png" has its own dot, and a naive split('.')
 * on a dot-delimited payload misaligned everything.
 *
 * Stateless / tamper-proof / time-limited — no DB lookup needed to validate.
 */
function signDownloadToken(jobId, outputFilename) {
  const expiry = Math.floor(Date.now() / 1000) + config.download.tokenTtlSeconds;
  const payload = JSON.stringify({ jobId, outputFilename, expiry });
  const sig = crypto
    .createHmac('sha256', config.download.tokenSecret)
    .update(payload)
    .digest('hex');
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  return `${encoded}.${sig}`;
}

export default router;