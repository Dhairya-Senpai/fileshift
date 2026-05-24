import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getCategory } from '../utils/fileTypes.js';
import { getAdapter } from './adapters/index.js';

/**
 * BullMQ job handler. Picks an adapter for the file's category, runs the
 * conversion, validates the output, and reports a structured result that
 * the jobs route uses to build the download token.
 *
 * Returned value is persisted by BullMQ and read back in GET /api/jobs/:id.
 */
export async function processJob(job) {
  const { uploadedFilename, sourceExt, targetExt, displayName } = job.data;

  const inputPath  = path.join(config.storage.uploadsDir, uploadedFilename);
  // New UUID for output — never derived from user input.
  const outputFilename = `${uuidv4()}.${targetExt}`;
  const outputPath = path.join(config.storage.outputsDir, outputFilename);

  const category = getCategory(sourceExt);
  const adapter = getAdapter(category);
  if (!adapter) {
    throw new Error(`No adapter registered for category: ${category}`);
  }

  // The upload route already wrote the file, but check again — it may have
  // been cleaned up if the job sat in the queue past the retention window.
  const inputStat = await fs.stat(inputPath).catch(() => null);
  if (!inputStat) {
    throw new Error('Source file no longer exists (possibly cleaned up).');
  }

  logger.info('Starting conversion', {
    jobId: job.id, displayName, sourceExt, targetExt, category,
    adapter: adapter.name, sizeBytes: inputStat.size,
  });

  const startedAt = Date.now();

  try {
    await adapter.convert({
      inputPath,
      outputPath,
      sourceExt,
      targetExt,
      onProgress: (pct) => job.updateProgress(pct).catch(() => {}),
    });

    // Verify output exists & is non-empty BEFORE marking success.
    // Some converters (looking at you, LibreOffice) exit 0 even when they
    // wrote nothing useful.
    const outStat = await fs.stat(outputPath).catch(() => null);
    if (!outStat || outStat.size === 0) {
      throw new Error('Conversion produced no output file.');
    }

    logger.info('Conversion complete', {
      jobId: job.id,
      durationMs: Date.now() - startedAt,
      outputSize: outStat.size,
    });

    // Drop the source — we don't need it anymore. Errors here are
    // non-fatal; cleanup cron (Phase 3) will catch any leftovers.
    fs.unlink(inputPath).catch((err) => {
      logger.warn('Could not delete source after success', {
        jobId: job.id, err: err.message,
      });
    });

    return { outputFilename, outputSize: outStat.size };
  } catch (err) {
    // Remove half-written output so it doesn't masquerade as success.
    await fs.unlink(outputPath).catch(() => {});
    logger.error('Conversion failed', {
      jobId: job.id, error: err.message, code: err.code,
    });
    throw err;
  }
}
