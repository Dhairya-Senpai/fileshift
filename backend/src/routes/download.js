import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/download/:token
 * Verifies an HMAC-signed token, then streams the converted file.
 * Tokens come from GET /api/jobs/:id when a job is complete.
 */
router.get('/:token', (req, res, next) => {
  try {
    const verified = verifyDownloadToken(String(req.params.token));
    if (!verified) {
      return res.status(403).json({ error: 'Invalid or expired download token.' });
    }

    const { outputFilename } = verified;

    // Defense-in-depth: resolve the path and confirm it's inside outputsDir.
    // The token signature already proves the filename hasn't been tampered
    // with, but we still validate the resolved path in case of bugs.
    const filePath = path.resolve(config.storage.outputsDir, outputFilename);
    if (!filePath.startsWith(config.storage.outputsDir + path.sep)) {
      logger.warn('Path traversal attempt blocked', { outputFilename });
      return res.status(400).json({ error: 'Invalid file path.' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found or already cleaned up.' });
    }

    // Force download (not inline render) — never let the browser interpret
    // a user-supplied file as something it might execute.
    const downloadName = encodeURIComponent(outputFilename);
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      logger.error('Download stream error', { message: err.message });
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

function verifyDownloadToken(token) {
  try {
    const [encodedPayload, sig] = token.split('.');
    if (!encodedPayload || !sig) return null;

    const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const expectedSig = crypto
      .createHmac('sha256', config.download.tokenSecret)
      .update(payload)
      .digest('hex');

    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expBuf.length) return null;
    // Constant-time compare — defeats timing oracles on signature checks.
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    const [jobId, outputFilename, expiryStr] = payload.split('.');
    const expiry = parseInt(expiryStr, 10);
    if (!expiry || expiry < Math.floor(Date.now() / 1000)) return null;

    // The filename embedded in the token must match what the worker produces:
    // UUID.ext — no slashes, no dotdot, no funny business.
    if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(outputFilename)) return null;

    return { jobId, outputFilename, expiry };
  } catch {
    return null;
  }
}

export default router;
