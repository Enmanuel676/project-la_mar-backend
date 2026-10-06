const logger = require('../config/logger');

// Registra cada petición cuando termina, no cuando llega: solo así se conoce el código
// de respuesta y cuánto tardó.
module.exports = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
};
