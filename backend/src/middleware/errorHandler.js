import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  // Common multer-specific cases get friendlier messages.
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large.' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected file field.' });
  }

  // Log the full error internally; never ship stack traces to the client.
  logger.error('Request error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  const status = err.status || 500;
  const safeMessage = status === 500 && config.env === 'production'
    ? 'Internal server error'
    : (err.message || 'Internal server error');

  res.status(status).json({ error: safeMessage });
}
