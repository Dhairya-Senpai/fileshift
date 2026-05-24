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
      const friendlyName = buildFriendlyName(job.data.displayName, job.data.targetExt);
      response.outputSize = outputSize;
      response.downloadToken = signDownloadToken(jobId, outputFilename, friendlyName);
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
 * Turn the original display name into a friendly download name with the
 * target extension. Examples:
 *   ("report.docx", "pdf")             -> "report.pdf"
 *   ("vacation pic.JPG", "webp")       -> "vacation pic.webp"
 *   ("no-extension", "png")            -> "no-extension.png"
 *   ("", "png")                        -> "converted.png"
 *
 * Sanitizes path-traversal characters even though displayName was already
 * stripped of control chars at upload time — defense in depth.
 */
function buildFriendlyName(displayName, targetExt) {
  const ext = String(targetExt || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (typeof displayName !== 'string' || !displayName) {
    return `converted.${ext || 'bin'}`;
  }
  const lastDot = displayName.lastIndexOf('.');
  const stem = lastDot > 0 ? displayName.slice(0, lastDot) : displayName;
  // Remove path separators, header-breaking quotes, and stray control chars.
  // eslint-disable-next-line no-control-regex
  const safe = stem.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
  const capped = safe.slice(0, 100) || 'converted';
  return `${capped}.${ext || 'bin'}`;
}

/**
 * HMAC-signed download token. Payload is JSON to avoid the parsing
 * ambiguity dot-delimited fields caused (filenames contain dots too).
 * friendlyName is part of the signed payload so the client can't tamper
 * with it to influence the Content-Disposition the server sends back.
 */
function signDownloadToken(jobId, outputFilename, friendlyName) {
  const expiry = Math.floor(Date.now() / 1000) + config.download.tokenTtlSeconds;
  const payload = JSON.stringify({ jobId, outputFilename, friendlyName, expiry });
  const sig = crypto
    .createHmac('sha256', config.download.tokenSecret)
    .update(payload)
    .digest('hex');
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  return `${encoded}.${sig}`;
}

export default router;