import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/:token', (req, res, next) => {
  try {
    const verified = verifyDownloadToken(String(req.params.token));
    if (!verified) {
      return res.status(403).json({ error: 'Invalid or expired download token.' });
    }

    const { outputFilename, friendlyName } = verified;

    const filePath = path.resolve(config.storage.outputsDir, outputFilename);
    if (!filePath.startsWith(config.storage.outputsDir + path.sep)) {
      logger.warn('Path traversal attempt blocked', { outputFilename });
      return res.status(400).json({ error: 'Invalid file path.' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found or already cleaned up.' });
    }

    // Use the friendly name from the token if present, fall back to the UUID
    // filename for legacy tokens that don't have one.
    res.setHeader('Content-Disposition', buildDisposition(friendlyName || outputFilename));
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
 * Build a Content-Disposition header that handles unicode filenames properly.
 *
 *   Content-Disposition: attachment; filename="<ascii fallback>"; filename*=UTF-8''<percent-encoded>
 *
 * Old browsers read `filename=` (ASCII-only). Modern browsers prefer
 * `filename*=` per RFC 5987, which supports any UTF-8.
 *
 * encodeURIComponent doesn't escape some characters RFC 5987 requires
 * escaped (single quote, parens, asterisk), so we touch those up manually.
 */
function buildDisposition(filename) {
  const asciiFallback = filename
    .replace(/[^\x20-\x7e]/g, '_')  // strip non-ASCII
    .replace(/["\\]/g, '_');         // strip quote/backslash that break the header

  const encoded = encodeURIComponent(filename)
    .replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

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
      logger.warn('Token rejected', { reason: 'sig length mismatch' });
      return null;
    }
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
      logger.warn('Token rejected', { reason: 'signature mismatch' });
      return null;
    }

    let parsed;
    try { parsed = JSON.parse(payload); }
    catch { logger.warn('Token rejected', { reason: 'payload not JSON' }); return null; }

    const { jobId, outputFilename, friendlyName, expiry } = parsed;
    const now = Math.floor(Date.now() / 1000);
    if (typeof expiry !== 'number' || expiry < now) {
      logger.warn('Token rejected', { reason: 'expired', expiry, now });
      return null;
    }
    if (typeof outputFilename !== 'string' ||
        !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(outputFilename)) {
      logger.warn('Token rejected', { reason: 'bad outputFilename shape', outputFilename });
      return null;
    }
    // friendlyName is optional (legacy tokens won't have it); when present,
    // it must be a plain string. It's already part of the signed payload so
    // we trust its content — but type-check anyway in case of malformed tokens.
    const safeFriendlyName = (typeof friendlyName === 'string' && friendlyName) ? friendlyName : null;

    return { jobId, outputFilename, friendlyName: safeFriendlyName, expiry };
  } catch (err) {
    logger.warn('Token rejected', { reason: 'exception', err: err.message });
    return null;
  }
}

export default router;