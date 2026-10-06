const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const validator = require('validator');

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
userSchema.statics.findByCredentials = async function findByCredentials(email, password) {
  const user = await this.findOne({ email }).select('+password');
  const matches = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  return user && matches ? user : null;
};

module.exports = mongoose.model('user', userSchema);
