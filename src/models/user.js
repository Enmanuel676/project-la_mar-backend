const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const validator = require('validator');
const env = require('../config/env');

// Correos con permisos de administrador total (pueden gestionar usuarios).
// Se cargan desde variables de entorno, separados por coma.
// Ejemplo: ADMIN_EMAILS="email1@ejemplo.com,email2@ejemplo.com"
const ADMIN_EMAILS = (env.adminEmails || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const userSchema = new mongoose.Schema({
  // Se guarda en minúsculas y sin espacios para que "Admin@LaMar.com " y "admin@lamar.com"
  // sean el mismo usuario.
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: (value) => validator.isEmail(value),
      message: 'El correo electrónico no es válido.',
    },
  },
  name: {
    type: String,
    trim: true,
    default: 'Admin',
  },
  // Rol del usuario: 'admin' puede gestionar usuarios, 'user' es un usuario normal.
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user',
  },
  // select: false: el hash nunca sale en una consulta normal. Para comprobar el login hay
  // que pedirlo a propósito con .select('+password').
  password: {
    type: String,
    required: true,
    select: false,
  },
});

// Hash de una contraseña cualquiera. Sirve para que comparar contraseñas tarde lo mismo
// cuando el correo no existe: si respondiera al instante, midiendo el tiempo se podría
// descubrir qué correos están registrados.
const DUMMY_HASH = bcrypt.hashSync('contraseña-de-relleno', 10);

// Devuelve el usuario, o null si el correo no existe o la contraseña no coincide. No distingue
// cuál de los dos falló: así no se le da pistas a quien intente adivinar correos.
userSchema.statics.findByCredentials = async function findByCredentials(
  email,
  password,
) {
  const user = await this.findOne({ email }).select('+password');
  const matches = await bcrypt.compare(
    password,
    user ? user.password : DUMMY_HASH,
  );
  return user && matches ? user : null;
};

// Comprueba si un correo tiene permisos de administrador.
userSchema.statics.isAdminEmail = function isAdminEmail(email) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
};

// Determina si un usuario es admin: por estar en la lista de correos admin
// O por tener role='admin'. Esta es la lista autoritativa para la administración.
userSchema.methods.isAdmin = function isAdmin() {
  return ADMIN_EMAILS.includes(this.email) || this.role === 'admin';
};

// Al convertir a JSON, nunca incluir la contraseña ni datos internos.
// Bury añadir el campo calculado isAdmin para que el frontend pueda usarlo directamente
userSchema.set('toJSON', {
  transform(_doc, ret) {
    const json = { ...ret };
    delete json.password;
    delete json.__v;
    // Añadir campo calculado isAdmin
    json.isAdmin = ADMIN_EMAILS.includes(json.email) || json.role === 'admin';
    return json;
  },
});

module.exports = mongoose.model('user', userSchema);
