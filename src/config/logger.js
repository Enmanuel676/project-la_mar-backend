const path = require('path');
const winston = require('winston');
const env = require('./env');

const {
  combine, timestamp, json, colorize, simple,
} = winston.format;

// Las rutas son fijas (backend/logs) para que no cambien según desde dónde se arranque.
// Dos archivos, como en el curso: request.log guarda todo y error.log solo los errores,
// para poder mirar los fallos sin filtrar el resto. Se escriben en JSON, una línea por registro.
const logger = winston.createLogger({
  level: 'info',
  format: combine(timestamp(), json()),
  transports: [
    new winston.transports.File({ filename: path.resolve(__dirname, '../../logs/request.log') }),
    new winston.transports.File({ filename: path.resolve(__dirname, '../../logs/error.log'), level: 'error' }),
  ],
});

// En desarrollo también sale por la terminal. En producción PM2 ya guarda la salida
// estándar, y con los archivos de arriba basta.
if (env.nodeEnv !== 'production') {
  logger.add(new winston.transports.Console({ format: combine(colorize(), simple()) }));
}

module.exports = logger;
