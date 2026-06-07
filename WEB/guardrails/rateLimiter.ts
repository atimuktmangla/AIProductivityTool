import rateLimit from 'express-rate-limit';

// 60 requests per minute per IP on the /api routes.
// Prevents accidental runaway polling and protects the on-prem Atlassian servers.
export const apiRateLimiter = rateLimit({
  windowMs:         60 * 1000,  // 1 minute
  max:              60,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: 'Too many requests — please wait before retrying.' },
});

// Stricter limiter for the expensive POST /metrics endpoint:
// max 10 full-team metric runs per minute per IP.
export const metricsRateLimiter = rateLimit({
  windowMs:         60 * 1000,
  max:              10,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: 'Too many metric requests — please wait before retrying.' },
});
