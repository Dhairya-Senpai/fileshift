import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { fileTypeFromFile } from 'file-type';

import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import {
  isSupportedExtension,
  sanitizeTargetExtension,
  canConvert,
  getCategory,
  TEXT_EXTENSIONS,
} from '../utils/fileTypes.js';
import { conversionQueue } from '../queue/queue.js';
import { uploadLimiter } from '../middleware/security.js';

const router = Router();

// Ensure storage dirs exist before any upload arrives.
await fs.mkdir(config.storage.uploadsDir, { recursive: true });
await fs.mkdir(config.storage.outputsDir, { recursive: true });

/**
 * Disk storage with random UUID filenames.
 *  - We NEVER use the user-provided filename on disk (prevents path
 *    traversal, filename collisions, weird filesystem chars).
 *  - The original name is sanitized & stored in job metadata only
 *    for display in the UI.
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.storage.uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    const safeExt = ext.replace(/[^a-z0-9]/g, '').slice(0, 10);
    cb(null, `${uuidv4()}.${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.storage.maxFileSize, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    if (!isSupportedExtension(ext)) {
      return cb(new Error(`Unsupported file type: .${ext}`));
    }
    cb(null, true);
  },
});

/**
 * POST /api/upload
 * Body: multipart with `file` (binary) and `target` (e.g. "png").
 * Returns 202 with jobId for status polling.
 */
router.post('/', uploadLimiter, upload.single('file'), async (req, res, next) => {
  let uploadedPath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }
    uploadedPath = req.file.path;

    const targetExt = sanitizeTargetExtension(req.body.target);
    if (!targetExt) {
      await safeUnlink(uploadedPath);
      return res.status(400).json({ error: 'Invalid or missing target format.' });
    }

    const sourceExt = path.extname(req.file.filename).toLowerCase().slice(1);

    if (!canConvert(sourceExt, targetExt)) {
      await safeUnlink(uploadedPath);
      return res.status(400).json({
        error: `Cannot convert .${sourceExt} to .${targetExt} (different file categories).`,
      });
    }

    // Magic-byte verification: don't trust the extension.
    // Skip for text-y formats that don't have stable magic bytes.
    if (!TEXT_EXTENSIONS.has(sourceExt)) {
      const detected = await fileTypeFromFile(uploadedPath);
      if (!detected) {
        await safeUnlink(uploadedPath);
        return res.status(400).json({ error: 'Could not verify file type.' });
      }
      const claimedCategory = getCategory(sourceExt);
      const detectedCategory = getCategory(detected.ext);
      if (claimedCategory !== detectedCategory) {
        logger.warn('File-type mismatch on upload', {
          claimed: sourceExt,
          detected: detected.ext,
          mime: detected.mime,
        });
        await safeUnlink(uploadedPath);
        return res.status(400).json({
          error: 'File content does not match its extension.',
        });
      }
    }

    const displayName = sanitizeDisplayName(req.file.originalname);

    const job = await conversionQueue.add(
      'convert',
      {
        uploadedFilename: req.file.filename, // UUID.ext — safe for shell use
        sourceExt,
        targetExt,
        displayName,
        sizeBytes: req.file.size,
        uploadedAt: new Date().toISOString(),
      },
      { timeout: config.job.timeoutMs },
    );

    logger.info('Conversion job queued', {
      jobId: job.id,
      sourceExt,
      targetExt,
      size: req.file.size,
    });

    res.status(202).json({
      jobId: job.id,
      status: 'queued',
      sourceExt,
      targetExt,
      displayName,
    });
  } catch (err) {
    if (uploadedPath) await safeUnlink(uploadedPath);
    next(err);
  }
});

async function safeUnlink(p) {
  try { await fs.unlink(p); } catch { /* best-effort cleanup */ }
}

function sanitizeDisplayName(name) {
  // Display-only — strip control chars & cap length.
  // eslint-disable-next-line no-control-regex
  return String(name).replace(/[\r\n\x00-\x1f]/g, '').slice(0, 200);
}

export default router;
