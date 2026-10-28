const mongoose = require('mongoose');
const env = require('./config/env');
const logger = require('./config/logger');
const { connectDb } = require('./config/db');
const app = require('./app');
const { schedulePurge } = require('./utils/purgeTrash');

let server;
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Recibida ${signal}. Cerrando servidor...`);
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  if (server) await new Promise((resolve) => { server.close(resolve); });
  await mongoose.disconnect();
  process.exit(0);
}

async function start() {
  await connectDb();
  server = app.listen(env.port, env.host, () => {
    logger.info(`API escuchando en ${env.host}:${env.port} (${env.nodeEnv})`);
    schedulePurge();
  });
  server.on('error', (error) => {
    logger.error(`No se pudo escuchar en el puerto ${env.port}: ${error.code}`);
    process.exit(1);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM').catch(() => process.exit(1)));
process.on('SIGINT', () => shutdown('SIGINT').catch(() => process.exit(1)));
process.on('unhandledRejection', (error) => {
  logger.error('Promesa rechazada sin capturar', { message: error?.message });
  process.exit(1);
});
start().catch((error) => {
  logger.error(`No se pudo iniciar el servidor: ${error.message}`);
  process.exit(1);
});
