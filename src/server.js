const path = require('path');
const fs = require('fs');
const env = require('./config/env');
const logger = require('./config/logger');
const connectDb = require('./config/db');
const app = require('./app');
const { schedulePurge } = require('./utils/purgeTrash');
const { startLogRotation } = require('./utils/rotateLogs');

// Asegurarse de que el directorio logs existe
const logDir = path.resolve(__dirname, '../logs');
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (err) {
  logger.error(`No se pudo crear el directorio logs: ${err.message}`);
}

async function start() {
  await connectDb();
  app.listen(env.port, () => {
    logger.info(`Servidor escuchando en el puerto ${env.port} (${env.nodeEnv})`);
  });
  schedulePurge();
  startLogRotation();
}

// Si no hay base de datos, arrancar a medias es peor que no arrancar: se sale con código 1
// y PM2 lo reinicia, dejando el motivo en el registro.
start().catch((err) => {
  logger.error(`No se pudo iniciar el servidor: ${err.message}`);
  process.exit(1);
});

// Una promesa rechazada sin capturar dejaría el servidor en un estado dudoso: se registra y
// se sale para que PM2 lo levante limpio.
process.on('unhandledRejection', (reason) => {
  logger.error(`Promesa rechazada sin capturar: ${reason}`);
  process.exit(1);
});
