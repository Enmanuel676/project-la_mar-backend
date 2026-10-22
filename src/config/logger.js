const path = require('path');
const winston = require('winston');
const env = require('./env');

const {
  combine,
  timestamp,
  json,
  colorize,
  simple,
} = winston.format;

// Las rutas son fijas (backend/logs) para que no cambien según desde dónde se arranque.
// Dos archivos, como en el curso: request.log guarda todo y error.log solo los errores,
// para poder mirar los fallos sin filtrar el resto.

// Formato para archivos: JSON con timestamp
const fileFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  json(),
);

// Asegurarse de que el directorio logs existe
const logDir = path.resolve(__dirname, '../../logs');

// Configuración base del logger
const logger = winston.createLogger({
  level: 'info',
  format: fileFormat,
  transports: [
    new winston.transports.File({ filename: path.resolve(logDir, 'request.log') }),
    // error.log: solo errores (level: 'error' y también 'warn' para incluir errores 4xx)
    new winston.transports.File({
      filename: path.resolve(logDir, 'error.log'),
      level: 'warn',
    }),
  ],
});

// En desarrollo también sale por la terminal. En producción PM2 ya guarda la salida
// estándar, y con los archivos de arriba basta.
if (env.nodeEnv !== 'production') {
  logger.add(new winston.transports.Console({ format: combine(colorize(), simple()) }));
}

module.exports = logger;
