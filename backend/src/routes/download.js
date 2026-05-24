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
 */
router.get('/:token', (req, res, next) => {
  try {
    const verified = verifyDownloadToken(String(req.params.token));
    if (!verified) {
      return res.status(403).json({ error: 'Invalid or expired download token.' });
    }

    const { outputFilename } = verified;

    // Defense in depth: even though the HMAC proves the filename wasn't
    // tampered with, still confirm the resolved path is inside outputsDir.
    const filePath = path.resolve(config.storage.outputsDir, outputFilename);
    if (!filePath.startsWith(config.storage.outputsDir + path.sep)) {
      logger.warn('Path traversal attempt blocked', { outputFilename });
      return res.status(400).json({ error: 'Invalid file path.' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found or already cleaned up.' });
    }

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

/**
 * Verify a token and return { jobId, outputFilename, expiry } or null.
 * Each rejection path logs a distinct reason — invaluable for debugging.
 *
 * Payload is JSON (not dot-delimited) — see jobs.js signDownloadToken for why.
 */
function verifyDownloadToken(token) {
  try {
    const [encodedPayload, sig] = token.split('.');
    if (!encodedPayload || !sig) {
      logger.warn('Token rejected', { reason: 'bad shape — missing dot' });
      return null;
    }

    const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const expectedSig = crypto
      .createHmac('sha256', config.download.tokenSecret)
      .update(payload)
      .digest('hex');

    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');

    if (sigBuf.length !== expBuf.length) {
      logger.warn('Token rejected', {
        reason: 'sig length mismatch',
        gotLen: sigBuf.length, expectedLen: expBuf.length,
      });
      return null;
    }
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
      logger.warn('Token rejected', {
        reason: 'signature mismatch — token was signed with a different secret',
        secretLen: config.download.tokenSecret.length,
      });
      return null;
    }

    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      logger.warn('Token rejected', { reason: 'payload is not valid JSON', payload });
      return null;
    }

    const { jobId, outputFilename, expiry } = parsed;
    const now = Math.floor(Date.now() / 1000);
    if (typeof expiry !== 'number' || expiry < now) {
      logger.warn('Token rejected', {
        reason: 'expired or missing expiry',
        expiry, now, secondsLate: typeof expiry === 'number' ? now - expiry : null,
      });
      return null;
    }
    if (typeof outputFilename !== 'string' ||
        !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(outputFilename)) {
      logger.warn('Token rejected', { reason: 'bad filename shape', outputFilename });
      return null;
    }

    return { jobId, outputFilename, expiry };
  } catch (err) {
    logger.warn('Token rejected', { reason: 'exception', err: err.message });
    return null;
  }
}

export default router;