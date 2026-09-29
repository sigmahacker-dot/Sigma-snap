import rateLimit from 'express-rate-limit';

const jsonMessage = (code: string, message: string) => ({
  error: { code, message },
});

/** Strict limiter for auth endpoints: 10 req/min per IP. */
export const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('RATE_LIMITED', 'Too many attempts, please try again in a minute'),
});

/** Lenient general API limiter. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('RATE_LIMITED', 'Too many requests, please slow down'),
});

/** Stricter limiter for write-heavy endpoints (reports, messages). */
export const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('RATE_LIMITED', 'Too many requests, please slow down'),
});
