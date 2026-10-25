const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

// Middleware para loggear cuando se alcanza el límite
function createRateLimiter(name, options) {
  const limiter = rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: options.message,
    skip: options.skip,
    // handler se usa para personalizar la respuesta cuando se alcanza el límite
    handler: (req, res) => {
      logger.warn(`Rate Limit (${name}) alcanzado desde ${req.ip}`, {
        path: req.path,
        ip: req.ip,
        method: req.method,
        userAgent: req.get('User-Agent'),
      });
      res.status(429).json(options.message);
    },
  });
  return limiter;
}

// Limitar intentos de login y registro para prevenir ataques de fuerza bruta.
// 15 requests por 15 minutos por IP.
const authLimiter = createRateLimiter('Auth', {
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 15, // límite de requests por ventana
  message: { message: 'Demasiados intentos. Inténtalo de nuevo en 15 minutos.' },
  skip: (req) => !req.path.startsWith('/api/auth'),
});

// Limitar requests generales a la API (excluyendo auth que ya tiene su límite).
// 100 requests por 15 minutos por IP.
const apiLimiter = createRateLimiter('API', {
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,
  message: { message: 'Demasiadas peticiones. Inténtalo de nuevo en 15 minutos.' },
  skip: (req) => req.path.startsWith('/api/auth') || req.path.includes('/static'),
});

module.exports = { authLimiter, apiLimiter };
