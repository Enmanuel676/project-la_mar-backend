const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

const mongooseOptions = {
  connectTimeoutMS: 5000,
  socketTimeoutMS: 30000,
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: 10,
  minPoolSize: 2,
  retryWrites: true,
  w: 'majority',
};

// El driver mantiene la reconexión; PM2 reintenta si falla el arranque inicial.
// No se registran listeners nuevos en cada reconexión ni se publica la URI con credenciales.
mongoose.connection.on('disconnected', () => logger.warn('MongoDB: desconectado'));
mongoose.connection.on('error', (err) => logger.error(`MongoDB: ${err.name}`));
async function connectDb() {
  await mongoose.connect(env.mongoUri, mongooseOptions);
  logger.info('MongoDB: conectado');
}
async function disconnectDb() {
  await mongoose.disconnect();
}
module.exports = { connectDb, disconnectDb, mongooseOptions };
