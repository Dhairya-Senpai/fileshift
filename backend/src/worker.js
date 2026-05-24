import { Worker } from 'bullmq';
import fs from 'fs/promises';

import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { redisConnection, CONVERSION_QUEUE } from './queue/queue.js';
import { initTools, TOOLS } from './utils/tools.js';
import { processJob } from './workers/processor.js';

/**
 * Worker process — runs separately from the API server (npm run worker).
 * Multiple worker processes can run side-by-side; BullMQ shares the queue
 * via Redis. Concurrency-within-process is set by WORKER_CONCURRENCY.
 */
async function main() {
  // Ensure storage dirs exist (uploads/outputs are created by upload route,
  // but workdir is touched only by adapters — make sure it's there).
  await fs.mkdir(config.storage.workDir, { recursive: true });

  // Detect tools ONCE at startup, not per job.
  await initTools();
  logger.info('Conversion tools resolved', {
    imagemagick: TOOLS.imagemagick || '(missing)',
    ffmpeg:      TOOLS.ffmpeg      || '(missing)',
    libreoffice: TOOLS.libreoffice || '(missing)',
  });

  const worker = new Worker(CONVERSION_QUEUE, processJob, {
    connection: redisConnection,
    concurrency: config.job.concurrency,
  });

  worker.on('completed', (job) => {
    logger.info('Job completed', { jobId: job.id });
  });
  worker.on('failed', (job, err) => {
    logger.error('Job failed', { jobId: job?.id, error: err?.message });
  });
  worker.on('error', (err) => {
    logger.error('Worker runtime error', { error: err.message });
  });

  logger.info(`Worker ready — concurrency=${config.job.concurrency}, queue=${CONVERSION_QUEUE}`);

  // Graceful shutdown: let in-flight jobs finish for up to 30s before exit.
  async function shutdown(signal) {
    logger.info(`${signal} received — closing worker`);
    try {
      await worker.close();
      logger.info('Worker closed cleanly');
      process.exit(0);
    } catch (err) {
      logger.error('Worker shutdown error', { error: err.message });
      process.exit(1);
    }
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Worker startup failed', { error: err.message, stack: err.stack });
  process.exit(1);
});
