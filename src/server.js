const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const mongoose = require('mongoose');
const env = require('./config/env');
const logger = require('./config/logger');
const { connectDb } = require('./config/db');
const app = require('./app');
const { schedulePurge } = require('./utils/purgeTrash');
const { startLogRotation } = require('./utils/rotateLogs');

// =============================================================================
// AUDITORIA: Funciones de diagnóstico del sistema
// =============================================================================

/**
 * Realiza auditoría del sistema antes de iniciar
 * @returns {Object} Resultado de la auditoría
 */
function performSystemAudit() {
  const audit = {
    timestamp: new Date().toISOString(),
    system: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / (1024 * 1024)), // MB
      freeMemory: Math.round(os.freemem() / (1024 * 1024)), // MB
      uptime: Math.round(os.uptime() / 60), // minutos
    },
    node: {
      version: process.version,
      memoryUsage: process.memoryUsage(),
    },
    environment: {
      nodeEnv: env.nodeEnv,
      port: env.port,
      mongoUri: env.mongoUri,
      hasJwtSecret: !!env.jwtSecret && env.jwtSecret.length >= 32,
      jwtSecretLength: env.jwtSecret ? env.jwtSecret.length : 0,
      gcsConfigured: !!env.gcsBucketName,
      adminEmails: env.adminEmails,
      logLevel: env.logLevel || 'info',
    },
    checks: [],
    warnings: [],
    errors: [],
  };

  // Verificar memoria disponible
  const memoryUsage = (audit.system.totalMemory - audit.system.freeMemory)
    / audit.system.totalMemory;
  if (memoryUsage > 0.8) {
    audit.warnings.push(`Alto uso de memoria del sistema: ${(memoryUsage * 100).toFixed(1)}%`);
  }

  // Verificar configuración obligatoria
  if (!env.mongoUri) {
    audit.errors.push('Falta MONGODB_URI en la configuración');
  }

  if (!env.jwtSecret || env.jwtSecret.length < 32) {
    audit.errors.push('JWT_SECRET debe tener al menos 32 caracteres');
  }

  if (env.nodeEnv === 'production' && (!env.jwtSecret || env.jwtSecret.length < 32)) {
    audit.errors.push('En producción, JWT_SECRET debe tener al menos 32 caracteres');
  }

  // Verificar que el puerto esté disponible
  const server = net.createServer();
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      audit.errors.push(`El puerto ${env.port} ya está en uso`);
    } else {
      audit.warnings.push(`Problema al verificar el puerto ${env.port}: ${err.message}`);
    }
  });
  server.once('listening', () => {
    server.close();
  });
  server.listen(env.port);

  return audit;
}

/**
 * Loguea el resultado de la auditoría
 * @param {Object} audit - Resultado de la auditoría
 */
function logAudit(audit) {
  logger.info('='.repeat(80));
  logger.info('AUDITORIA DE INICIO DEL SERVIDOR');
  logger.info('='.repeat(80));

  logger.info(`Sistema: ${audit.system.hostname} (${os.platform()} ${os.arch()})`);
  logger.info(`Memoria: ${audit.system.freeMemory}MB libres de ${audit.system.totalMemory}MB`);
  logger.info(`Node.js: ${audit.node.version}`);
  logger.info(`Entorno: ${audit.environment.nodeEnv}`);
  logger.info(`Puerto: ${audit.environment.port}`);
  logger.info(`MongoDB: ${audit.environment.mongoUri}`);
  logger.info(`JWT Secret: ${audit.environment.hasJwtSecret ? 'Configurado' : 'NO CONFIGURADO'}`);

  if (audit.checks.length > 0) {
    logger.info(`Checks pasados: ${audit.checks.length}`);
    audit.checks.forEach((check) => logger.info(`  ✓ ${check}`));
  }

  if (audit.warnings.length > 0) {
    logger.warn(`Advertencias: ${audit.warnings.length}`);
    audit.warnings.forEach((warning) => logger.warn(`  ⚠ ${warning}`));
  }

  if (audit.errors.length > 0) {
    logger.error(`Errores críticos: ${audit.errors.length}`);
    audit.errors.forEach((error) => logger.error(`  ✗ ${error}`));
  }

  logger.info('='.repeat(80));
}

// =============================================================================
// Configuración inicial
// =============================================================================

// Asegurarse de que el directorio logs existe
const logDir = path.resolve(__dirname, '../logs');
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
    logger.info(`Directorio logs creado: ${logDir}`);
  }
} catch (err) {
  console.error(`[AUDITORIA] No se pudo crear el directorio logs: ${err.message}`);
  process.exit(1);
}

// Realizar auditoría antes de iniciar
const audit = performSystemAudit();
logAudit(audit);

// Si hay errores críticos, no continuar
if (audit.errors.length > 0) {
  logger.error('No se puede iniciar el servidor debido a errores críticos de configuración');
  process.exit(1);
}

// =============================================================================
// Función principal de inicio
// =============================================================================

async function start() {
  try {
    logger.info('Iniciando conexión a MongoDB...');
    await connectDb();
    logger.info('✓ Conexión a MongoDB establecida');

    // Verificar conexión a MongoDB
    if (mongoose.connection.readyState !== 1) {
      throw new Error('No se pudo establecer conexión a MongoDB');
    }

    // Configurar endpoint de auditoría
    app.get('/api/audit', (req, res) => {
      const currentAudit = {
        ...performSystemAudit(),
        database: {
          connected: mongoose.connection.readyState === 1,
          dbName: mongoose.connection.db ? mongoose.connection.db.databaseName : null,
        },
      };
      res.json(currentAudit);
    });

    // Actualizar el endpoint de health para reflejar el estado de MongoDB
    // Como app.js ya tiene el endpoint /api/health, lo actualizamos aquí
    // eslint-disable-next-line no-underscore-dangle
    const routerStack = app._router.stack;
    const healthEndpoint = routerStack.find(
      (layer) => layer.route && layer.route.path === '/api/health',
    );
    if (healthEndpoint) {
      healthEndpoint.route.stack[0].handle = (req, res) => {
        res.json({
          status: 'ok',
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          environment: env.nodeEnv,
          mongoConnected: mongoose.connection.readyState === 1,
          dbName: mongoose.connection.db ? mongoose.connection.db.databaseName : null,
          uptime: process.uptime(),
        });
      };
    }

    logger.info(`Iniciando servidor en el puerto ${env.port}...`);
    const server = app.listen(env.port, () => {
      logger.info(`✓ Servidor escuchando en el puerto ${env.port} (${env.nodeEnv})`);
      logger.info(`  URL base: http://localhost:${env.port}/api`);
      logger.info(`  Health check: http://localhost:${env.port}/api/health`);
      logger.info(`  Auditoria: http://localhost:${env.port}/api/audit`);
    });

    // Manejar errores del servidor
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`✗ El puerto ${env.port} ya está en uso`);
        logger.error('  Solución: Mate el proceso actual con `lsof -i :3000` y luego `kill -9 <PID>`');
        logger.error('  O use un puerto diferente estableciendo PORT=3001 en el .env');
      } else {
        logger.error(`✗ Error del servidor: ${error.message}`);
      }
      process.exit(1);
    });

    // Configurar manejo de señales para apagado gracioso
    process.on('SIGTERM', () => {
      logger.info('Recibida señal SIGTERM. Cerrando servidor...');
      server.close(async () => {
        logger.info('Servidor cerrado. Desconectando de MongoDB...');
        try {
          await mongoose.disconnect();
          logger.info('✓ Desconexión de MongoDB completa');
          process.exit(0);
        } catch (err) {
          logger.error(`✗ Error al desconectar de MongoDB: ${err.message}`);
          process.exit(1);
        }
      });
    });

    process.on('SIGINT', () => {
      logger.info('Recibida señal SIGINT. Cerrando servidor...');
      server.close(async () => {
        logger.info('Servidor cerrado. Desconectando de MongoDB...');
        try {
          await mongoose.disconnect();
          logger.info('✓ Desconexión de MongoDB completa');
          process.exit(0);
        } catch (err) {
          logger.error(`✗ Error al desconectar de MongoDB: ${err.message}`);
          process.exit(1);
        }
      });
    });

    // Iniciar tareas programadas
    schedulePurge();
    startLogRotation();

    logger.info('✓ Tareas programadas iniciadas (purga de papelera y rotación de logs)');
  } catch (err) {
    logger.error(`✗ No se pudo iniciar el servidor: ${err.message}`);
    logger.error(`  Stack: ${err.stack}`);
    process.exit(1);
  }
}

// =============================================================================
// Manejo de errores globales
// =============================================================================

// Si no hay base de datos, arrancar a medias es peor que no arrancar: se sale con código 1
// y PM2 lo reinicia, dejando el motivo en el registro.
start().catch((err) => {
  logger.error(`✗ Error crítico al iniciar: ${err.message}`);
  logger.error(`  Stack: ${err.stack}`);
  process.exit(1);
});

// Una promesa rechazada sin capturar dejaría el servidor en un estado dudoso: se registra y
// se sale para que PM2 lo levante limpio.
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`✗ Promesa rechazada sin capturar en ${promise}`);
  logger.error(`  Razón: ${reason}`);
  if (reason instanceof Error) {
    logger.error(`  Stack: ${reason.stack}`);
  }
  process.exit(1);
});

// Manejar errores no capturados
process.on('uncaughtException', (err) => {
  logger.error(`✗ Excepción no capturada: ${err.message}`);
  logger.error(`  Stack: ${err.stack}`);
  process.exit(1);
});

// Manejar advertencias de Node.js
process.on('warning', (warning) => {
  logger.warn(`⚠ Advertencia de Node.js: ${warning.name} - ${warning.message}`);
});

// Loguear cuando el proceso termine
process.on('exit', (code) => {
  if (code !== 0) {
    logger.error(`Proceso terminado con código ${code}`);
  } else {
    logger.info('Proceso terminado con éxito');
  }
});
