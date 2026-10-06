const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

async function connectDb() {
  await mongoose.connect(env.mongoUri);
  logger.info('Conectado a MongoDB');
}

module.exports = connectDb;
