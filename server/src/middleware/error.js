import { ZodError } from 'zod';
import { HttpError } from '../lib/errors.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'validation_error',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
  }
  // Prisma unique constraint
  if (err?.code === 'P2002') {
    return res.status(409).json({ error: 'unique_violation', target: err.meta?.target });
  }
  if (err?.code === 'P2025') {
    return res.status(404).json({ error: 'not_found' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid_json' });
  }
  if (err?.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    return res.status(err.statusCode).json({ error: err.code ?? 'bad_request', message: err.message });
  }
  console.error('[server error]', err);
  return res.status(500).json({ error: 'internal_error' });
}
