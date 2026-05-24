import { Queue, QueueEvents } from 'bullmq';
import { config } from '../config/index.js';

// Shared connection options. BullMQ workers (Phase 2) reuse this.
export const redisConnection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  // Required by BullMQ — it needs to manage retries itself.
  maxRetriesPerRequest: null,
};

export const CONVERSION_QUEUE = 'conversion';

export const conversionQueue = new Queue(CONVERSION_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: config.job.maxAttempts,
    backoff: { type: 'exponential', delay: 5000 },
    // Auto-trim completed/failed jobs so Redis doesn't grow forever.
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
  },
});

// Lets us await job completion / progress events if we want to stream
// updates to the client later (Phase 4: WebSocket support).
export const conversionEvents = new QueueEvents(CONVERSION_QUEUE, {
  connection: redisConnection,
});
