import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const intEnv = (name, fallback) => {
  const v = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) ? v : fallback;
};

export const config = {
  port: intEnv('PORT', 4000),
  env: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Files live OUTSIDE any web-served path. Downloads only happen via
  // signed-token endpoint, never by guessing a URL.
  storage: {
    uploadsDir: path.resolve(__dirname, '../../storage/uploads'),
    outputsDir: path.resolve(__dirname, '../../storage/outputs'),
    maxFileSize: intEnv('MAX_FILE_SIZE', 524_288_000), // 500 MB
    retentionHours: intEnv('RETENTION_HOURS', 2),
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: intEnv('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  job: {
    timeoutMs: intEnv('JOB_TIMEOUT_MS', 600_000),
    maxAttempts: intEnv('JOB_MAX_ATTEMPTS', 2),
    concurrency: intEnv('WORKER_CONCURRENCY', 2),
  },

  download: {
    tokenSecret: process.env.DOWNLOAD_TOKEN_SECRET || 'dev-secret-change-me-in-production',
    tokenTtlSeconds: intEnv('DOWNLOAD_TOKEN_TTL', 3600),
  },
};

// Fail loudly if running in production with insecure defaults.
if (config.env === 'production') {
  if (config.download.tokenSecret.startsWith('dev-secret')) {
    throw new Error('DOWNLOAD_TOKEN_SECRET must be set to a strong secret in production.');
  }
}
