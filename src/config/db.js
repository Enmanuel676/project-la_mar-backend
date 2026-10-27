const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

// Opciones de conexión a MongoDB
const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  // Configuración para manejo de errores de conexión
  connectTimeoutMS: 5000, // 5 segundos para conexiones iniciales
  socketTimeoutMS: 30000, // 30 segundos de inactividad antes de timeout
  serverSelectionTimeoutMS: 5000, // 5 segundos para seleccionar servidor
  maxPoolSize: 10, // Conexiones máximo en el pool
  minPoolSize: 2, // Conexiones mínimo en el pool
  retryWrites: true,
  w: 'majority', // Esperar confirmación de mayoría para escrituras
  // Eventos de monitoreo
  monitorCommands: env.nodeEnv === 'development',
};

// Contador de intentos de reconexión
let retryCount = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

// Función para conectar a MongoDB con reintentos
async function connectWithRetry() {
  try {
    logger.info(`Intentando conectar a MongoDB (intento ${retryCount + 1})...`);
    await mongoose.connect(env.mongoUri, mongooseOptions);
    
    // Verificar conexión exitosamente
    const db = mongoose.connection;
    db.once('open', () => {
      logger.info(`✓ Conectado a MongoDB: ${env.mongoUri}`);
      logger.info(`  Base de datos: ${db.db.databaseName}`);
      logger.info(`  Estado: ${db.readyState}`);
      retryCount = 0; // Resetear contador al conectar
    });

    // Manejar eventos de conexión
    db.on('connected', () => {
      logger.info('MongoDB: Conectado');
    });

    db.on('disconnected', () => {
      logger.warn('MongoDB: Desconectado');
      if (retryCount < MAX_RETRIES) {
        retryCount += 1;
        logger.info(`MongoDB: Intentando reconectar (${retryCount}/${MAX_RETRIES})...`);
        setTimeout(connectWithRetry, RETRY_DELAY_MS);
      } else {
        logger.error(`MongoDB: Máximo de reintentos (${MAX_RETRIES}) alcanzado. Desistiendo.`);
      }
    });

    db.on('error', (err) => {
      logger.error(`MongoDB error: ${err.message}`);
      // Si el error es de conexión y no estamos en proceso de reconexión, intentar reconectar
      if (err.name === 'MongoServerSelectionError' || err.name === 'MongoNetworkError') {
        if (retryCount < MAX_RETRIES) {
          retryCount += 1;
          logger.info(`MongoDB: Intentando reconectar (${retryCount}/${MAX_RETRIES})...`);
          setTimeout(connectWithRetry, RETRY_DELAY_MS);
        } else {
          logger.error(`MongoDB: Máximo de reintentos (${MAX_RETRIES}) alcanzado. Desistiendo.`);
        }
      }
    });

    // Verificar que la base de datos esté accesible
    await db.db.command({ ping: 1 });
    logger.info('✓ Ping a MongoDB exitoso');

    return db;
  } catch (err) {
    logger.error(`✗ No se pudo conectar a MongoDB: ${err.message}`);
    
    // Errores específicos de MongoDB
    if (err.name === 'MongoServerSelectionError') {
      logger.error('  Posibles causas:');
      logger.error('    - MongoDB no está corriendo');
      logger.error(`    - URI incorrecta: ${env.mongoUri}`);
      logger.error('    - Firewall bloqueando la conexión');
      logger.error('    - Credenciales incorrectas');
    } else if (err.name === 'MongoNetworkError') {
      logger.error('  Error de red al conectar a MongoDB');
      logger.error('    - Verificar que MongoDB esté accesible');
      logger.error('    - Verificar configuración de firewall');
    } else if (err.code === 'ECONNREFUSED') {
      logger.error('  Conexión rechazada a MongoDB');
      logger.error(`    - Asegurar que MongoDB esté corriendo en ${env.mongoUri}`);
    }

    // Intentar reconectar si no hemos alcanzado el máximo
    if (retryCount < MAX_RETRIES) {
      retryCount += 1;
      logger.info(`MongoDB: Reintentando en ${RETRY_DELAY_MS / 1000} segundos... (${retryCount}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return connectWithRetry();
    }

    logger.error(`✗ Máximo de reintentos (${MAX_RETRIES}) alcanzado. No se puede conectar a MongoDB.`);
    throw err;
  }
}

async function connectDb() {
  await connectWithRetry();
}

// Función para cerrar la conexión
async function disconnectDb() {
  try {
    await mongoose.disconnect();
    logger.info('✓ Desconectado de MongoDB');
  } catch (err) {
    logger.error(`✗ Error al desconectar de MongoDB: ${err.message}`);
    throw err;
  }
}

module.exports = { connectDb, disconnectDb, mongooseOptions };
