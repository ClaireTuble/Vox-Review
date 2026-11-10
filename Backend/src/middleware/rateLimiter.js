/**
 * In-memory sliding-window rate limiter for sensitive authentication endpoints.
 * Operates without external Redis dependencies to maintain maximum portability.
 */

const windows = new Map();

/**
 * Creates a rate limiting middleware.
 *
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default 15 minutes)
 * @param {number} options.max - Maximum requests per window (default 5)
 * @param {string} options.message - Error message when rate limit is exceeded
 * @param {function} [options.keyGenerator] - Custom key generator function (defaults to IP address)
 */
export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 5,
  message = "Too many requests. Please try again later.",
  keyGenerator = (req) =>
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    "0.0.0.0",
} = {}) {
  // Periodic cleanup of expired buckets every 5 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of windows.entries()) {
      if (now > record.resetTime) {
        windows.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  if (cleanupInterval.unref) cleanupInterval.unref();

  return function rateLimiterMiddleware(req, res, next) {
    const key = keyGenerator(req);
    const now = Date.now();

    let record = windows.get(key);
    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      windows.set(key, record);
      return next();
    }

    if (record.count >= max) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message,
        error: message,
        retryAfter: retryAfterSeconds,
      });
    }

    record.count += 1;
    return next();
  };
}
