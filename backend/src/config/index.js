import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Single source of truth for env vars: <project-root>/.env
// Same file is read by docker-compose, so dev and Docker stay in sync —
// no risk of DOWNLOAD_TOKEN_SECRET drifting between deployment modes.
// Falls back to backend/.env if the root file doesn't exist (legacy paths).
const rootEnv = path.resolve(__dirname, '../../../.env');
const localEnv = path.resolve(__dirname, '../../.env');
dotenv.config({ path: rootEnv });
dotenv.config({ path: localEnv });  // no-op if vars already set from rootEnv

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
  // workDir holds per-job scratch space — must be on the same filesystem
  // as outputsDir so adapter renames are atomic (no EXDEV on Windows).
  storage: {
    uploadsDir: path.resolve(__dirname, '../../storage/uploads'),
    outputsDir: path.resolve(__dirname, '../../storage/outputs'),
    workDir:    path.resolve(__dirname, '../../storage/work'),
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

  cleanup: {
    intervalMinutes: intEnv('CLEANUP_INTERVAL_MINUTES', 15),
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