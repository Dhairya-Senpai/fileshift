import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { generalLimiter } from './middleware/security.js';

import uploadRouter from './routes/upload.js';
import jobsRouter from './routes/jobs.js';
import downloadRouter from './routes/download.js';

const app = express();

// Trust one proxy hop (e.g. nginx) so rate limiting sees the real client IP.
// If you deploy behind multiple proxies, increase this number.
app.set('trust proxy', 1);

// Security headers FIRST so every response gets them, including 404s/errors.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'DELETE'],
}));

// Small JSON bodies only — uploads go through multer in the upload router.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Broad rate limit on every route. Upload route has a stricter one on top.
app.use(generalLimiter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/upload', uploadRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/download', downloadRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler must be registered LAST.
app.use(errorHandler);

const server = app.listen(config.port, () => {
  logger.info(`FileShift API listening on port ${config.port} (${config.env})`);
});

// Graceful shutdown: stop accepting new connections, let in-flight requests
// finish, but kill after 10s if they hang.
function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
