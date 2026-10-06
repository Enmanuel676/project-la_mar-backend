const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const logger = require('../src/config/logger');
const connectDb = require('../src/config/db');
const User = require('../src/models/user');

// Valores por defecto solo para probar en local; coinciden con los del panel con datos de prueba.
const DEFAULT_EMAIL = 'admin@lamar.com';
const DEFAULT_PASSWORD = 'lamar2026';

async function createAdmin() {
  const email = (process.env.ADMIN_EMAIL || DEFAULT_EMAIL).trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;

  // Una contraseña conocida de antemano no puede llegar al servidor real.
  if (env.nodeEnv === 'production' && password === DEFAULT_PASSWORD) {
    throw new Error('En producción define ADMIN_PASSWORD: no se permite la contraseña por defecto.');
  }

  await connectDb();
  const hash = await bcrypt.hash(password, 10);

  // upsert: si el correo ya existe se cambia su contraseña, así el mismo script sirve
  // para crear el admin y para restablecerla.
  await User.findOneAndUpdate(
    { email },
    { email, password: hash, name: 'Admin' },
    { upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  logger.info(`Administrador listo: ${email}`);
}

createAdmin()
  .catch((err) => {
    logger.error(`No se pudo crear el administrador: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
