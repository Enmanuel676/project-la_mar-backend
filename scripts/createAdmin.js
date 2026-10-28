const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const logger = require('../src/config/logger');
const { connectDb } = require('../src/config/db');
const User = require('../src/models/user');

/* ==================================================================
 * CREACIÓN DE ADMINISTRADOR INICIAL
 * ------------------------------------------------------------------
 * Este script crea el primer administrador o restablece su contraseña.
 * Se usa en entornos sin interfaz gráfica (producción sin panel).
 *
 *   ADMIN_EMAIL="correo@ejemplo.com" ADMIN_NAME="Nombre" \
 *   ADMIN_PASSWORD="contraseña-de-8-o-más" npm run seed:admin
 *
 * - Si el correo no existe, crea la cuenta (contraseña guardada con bcrypt).
 * - Si ya existe, actualiza su nombre y su contraseña.
 *
 * Los administradores posteriores se crean desde una sesión de administrador.
 * ================================================================== */

// Valores por defecto solo para probar en local; coinciden con los del panel con datos de prueba.
const DEFAULT_EMAIL = 'admin@lamar.com';
const DEFAULT_NAME = 'Admin';
const DEFAULT_PASSWORD = 'lamar2026';
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128; // el mismo límite que valida el login

async function createAdmin() {
  const email = (process.env.ADMIN_EMAIL || DEFAULT_EMAIL).trim().toLowerCase();
  const name = (process.env.ADMIN_NAME || DEFAULT_NAME).trim();
  const password = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;

  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres.`);
  }

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
    {
      email, password: hash, name, role: 'admin',
    },
    { upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  logger.info(`Administrador listo: ${email} (${name})`);
}

createAdmin()
  .catch((err) => {
    logger.error(`No se pudo crear el administrador: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    // Los archivos de registro de winston mantienen vivo el proceso: se cierran (después de
    // escribir lo pendiente) y entonces se sale con el código que corresponda.
    logger.logger.on('finish', () => process.exit());
    logger.logger.end();
  });
