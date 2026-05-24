import fs from 'fs/promises';
import path from 'path';

import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Walk a directory and delete entries (files OR subdirs) whose mtime is
 * older than maxAgeMs.
 *
 * Why mtime and not creation time? Two reasons:
 *  1. Linux ext4 doesn't track btime by default.
 *  2. If a file is being actively written, its mtime keeps updating —
 *     so an in-flight conversion won't accidentally get its source/output
 *     deleted mid-process.
 *
 * Errors deleting individual entries are logged but don't abort the sweep.
 */
async function sweepDirectory(dir, maxAgeMs) {
  let deletedFiles = 0;
  let deletedDirs  = 0;
  let freedBytes   = 0;

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn('Cleanup: readdir failed', { dir, err: err.message });
    }
    return { deletedFiles, deletedDirs, freedBytes };
  }

  const now = Date.now();

  for (const entry of entries) {
    if (entry.name === '.gitkeep') continue;

    const full = path.join(dir, entry.name);
    try {
      const stat = await fs.stat(full);
      if (now - stat.mtimeMs < maxAgeMs) continue;

      if (entry.isDirectory()) {
        // Office adapter leaves a workdir per job if it crashes mid-conversion.
        // Recursive cleanup handles those.
        await fs.rm(full, { recursive: true, force: true });
        deletedDirs++;
      } else {
        freedBytes += stat.size;
        await fs.unlink(full);
        deletedFiles++;
      }
    } catch (err) {
      logger.warn('Cleanup: could not delete entry', { path: full, err: err.message });
    }
  }

  return { deletedFiles, deletedDirs, freedBytes };
}

async function runCleanup() {
  const maxAgeMs = config.storage.retentionHours * 3600 * 1000;
  const dirs = [
    config.storage.uploadsDir,
    config.storage.outputsDir,
    config.storage.workDir,
  ];

  const startedAt = Date.now();
  const results = await Promise.all(dirs.map((d) => sweepDirectory(d, maxAgeMs)));

  const totals = results.reduce((acc, r) => ({
    deletedFiles: acc.deletedFiles + r.deletedFiles,
    deletedDirs:  acc.deletedDirs  + r.deletedDirs,
    freedBytes:   acc.freedBytes   + r.freedBytes,
  }), { deletedFiles: 0, deletedDirs: 0, freedBytes: 0 });

  // Only log when there's actually something to report — avoids
  // dumping a "nothing happened" line every 15 minutes.
  if (totals.deletedFiles > 0 || totals.deletedDirs > 0) {
    logger.info('Cleanup sweep complete', {
      durationMs: Date.now() - startedAt,
      ...totals,
      retentionHours: config.storage.retentionHours,
    });
  }
}

let intervalHandle = null;

/**
 * Start the recurring cleanup task. Runs once shortly after startup
 * (to clean up any leftovers from a previous crash), then on a fixed
 * interval. The handle is unref()'d so it won't keep the process alive
 * during graceful shutdown.
 */
export function startCleanupCron() {
  const intervalMs = config.cleanup.intervalMinutes * 60 * 1000;

  // Initial sweep — delayed a few seconds so it doesn't compete with startup
  // I/O. Wrapped so a sync throw can't crash the process.
  setTimeout(() => {
    runCleanup().catch((err) => {
      logger.error('Initial cleanup failed', { err: err.message });
    });
  }, 5_000).unref();

  intervalHandle = setInterval(() => {
    runCleanup().catch((err) => {
      logger.error('Periodic cleanup failed', { err: err.message });
    });
  }, intervalMs);
  intervalHandle.unref();

  logger.info('Cleanup task scheduled', {
    intervalMinutes: config.cleanup.intervalMinutes,
    retentionHours: config.storage.retentionHours,
  });
}

export function stopCleanupCron() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}