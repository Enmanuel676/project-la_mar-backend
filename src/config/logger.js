const path = require('path');
const fs = require('fs');
const winston = require('winston');
const env = require('./env');

const {
  combine,
  timestamp,
  json,
  colorize,
  printf,
  errors,
} = winston.format;

// Las rutas son fijas (backend/logs) para que no cambien según desde dónde se arranque.
// Dos archivos, como en el curso: request.log guarda todo y error.log solo los errores,
// para poder mirar los fallos sin filtrar el resto.

// Formato para archivos: JSON con timestamp
const fileFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  errors({ stack: true }),
  json(),
);

// Formato para consola en desarrollo
const consoleFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss.SSS' }),
  printf(({
    level, message, timestamp: logTimestamp, stack,
  }) => {
    let output = `${logTimestamp} [${level}]: ${message}`;
    if (stack) {
      output += `\n${stack}`;
    }
    return output;
  }),
);

// Asegurarse de que el directorio logs existe
const logDir = path.resolve(__dirname, '../../logs');

// Crear directorio si no existe (con manejo de errores)
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
    console.log(`[LOGGER] Directorio logs creado: ${logDir}`);
  }
} catch (err) {
  // Si no se puede crear el directorio, usar consola
  console.error(`[LOGGER] No se pudo crear el directorio logs: ${err.message}`);
  console.error('[LOGGER] Usando solo salida a consola');
}

// Configuración base del logger
const logger = winston.createLogger({
  level: env.logLevel || 'info',
  format: fileFormat,
  transports: [
    // request.log: guarda todo
    new winston.transports.File({
      filename: path.resolve(logDir, 'request.log'),
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5, // Mantener 5 archivos
      tailable: true,
    }),
    // error.log: solo errores (level: 'error' y también 'warn' para incluir errores 4xx)
    new winston.transports.File({
      filename: path.resolve(logDir, 'error.log'),
      level: 'warn',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
      tailable: true,
    }),
  ],
  // No salir si hay errores en el logger (evita crash)
  exitOnError: false,
});

// En desarrollo también sale por la terminal. En producción PM2 ya guarda la salida
// estándar, y con los archivos de arriba basta.
if (env.nodeEnv !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
}

// Manejar errores del logger
logger.on('error', (err) => {
  console.error('[LOGGER ERROR]', err.message);
});

// Función para loguear con metadatos estructurados
function info(message, meta = {}) {
  logger.info(message, { ...meta, timestamp: new Date().toISOString() });
}

function warn(message, meta = {}) {
  logger.warn(message, { ...meta, timestamp: new Date().toISOString() });
}

function error(message, meta = {}) {
  logger.error(message, { ...meta, timestamp: new Date().toISOString() });
}

function debug(message, meta = {}) {
  logger.debug(message, { ...meta, timestamp: new Date().toISOString() });
}

module.exports = {
  info,
  warn,
  error,
  debug,
  // Exportar el logger original para compatibilidad
  logger,
};
