const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

const LOG_DIR = path.resolve(__dirname, '../../logs');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_LOG_FILES = 5; // Mantener hasta 5 archivos rotados

/**
 * Rota los archivos de log si exceden el tamaño máximo.
 * Crea un archivo con timestamp (p. ej. error.log.2026-10-22-14-30-00)
 * y mantiene solo los últimos MAX_LOG_FILES archivos.
 */
function rotateLogFile(filename) {
  const filePath = path.resolve(LOG_DIR, filename);

  try {
    // Verificar si el archivo existe y es muy grande
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size >= MAX_LOG_SIZE) {
        // Crear nombre del archivo rotado con timestamp
        const timestamp = new Date().toISOString()
          .replace(/[:.]/g, '-')
          .replace('T', '-')
          .split('.')[0];
        const rotatedPath = path.resolve(LOG_DIR, `${filename}.${timestamp}`);

        // Renombrar el archivo actual
        fs.renameSync(filePath, rotatedPath);

        // Eliminar archivos rotados viejos (mantener solo MAX_LOG_FILES)
        const files = fs.readdirSync(LOG_DIR)
          .filter((f) => f.startsWith(filename) && f !== filename)
          .sort()
          .reverse();

        if (files.length > MAX_LOG_FILES) {
          const filesToDelete = files.slice(MAX_LOG_FILES);
          filesToDelete.forEach((f) => {
            try {
              fs.unlinkSync(path.resolve(LOG_DIR, f));
            } catch (err) {
              logger.error(`Error al eliminar archivo de log antiguo ${f}: ${err.message}`);
            }
          });
        }

        logger.info(`Log rotado: ${filename} -> ${filename}.${timestamp}`);
      }
    }
  } catch (err) {
    logger.error(`Error al rotar ${filename}: ${err.message}`);
  }
}

/**
 * Verifica y rota todos los archivos de log
 */
function rotateAllLogs() {
  const logFiles = ['error.log', 'request.log'];
  logFiles.forEach(rotateLogFile);
}

/**
 * Inicia el temporizador para rotar logs cada hora
 */
function startLogRotation() {
  // Rotar logs al iniciar
  rotateAllLogs();

  // Rotar logs cada hora
  setInterval(rotateAllLogs, 60 * 60 * 1000);
}

module.exports = { startLogRotation, rotateAllLogs, rotateLogFile };
