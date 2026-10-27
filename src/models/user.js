const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const validator = require('validator');

const ROLES = ['admin', 'user'];

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      trim: true,
      maxlength: 50,
      default: '',
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: 50,
      default: '',
    },
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
    role: {
      type: String,
      enum: ROLES,
      default: 'user',
    },
    // select: false: el hash nunca sale en una consulta normal. Para comprobar el login hay
    // que pedirlo a propósito con .select('+password').
    password: {
      type: String,
      required: true,
      select: false,
      minlength: 8,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Nombre completo para mostrar en el panel. El frontend lo usa como `user.name`.
// Si el usuario es legacy (solo tiene el campo `name` en la BD, sin firstName/lastName),
// se lee con this.get('name') que accede al documento raw de MongoDB.
userSchema.virtual('name').get(function getFullName() {
  const first = this.firstName || '';
  const last = this.lastName || '';
  if (first || last) return `${first} ${last}`.trim();
  // Fallback para usuarios legacy: this.get() lee campos del documento raw
  // aunque no estén definidos en el schema.
  return this.get('name') || 'Admin';
});

// isAdmin es un virtual derivado de role: nunca puede quedar desincronizado.
userSchema.virtual('isAdmin').get(function getIsAdmin() {
  return this.role === 'admin';
});

// id como string, igual que en Article, para que el frontend no tenga que distinguir
// entre `id` y `_id`.
userSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    const json = { ...ret };
    json.id = ret._id.toString();
    delete json._id;
    delete json.__v;
    delete json.password;
    return json;
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

// Crea un usuario con la contraseña ya hasheada.
userSchema.statics.createWithPassword = async function createWithPassword(data) {
  const { password, ...rest } = data;
  const hashed = await bcrypt.hash(password, 10);
  return this.create({ ...rest, password: hashed });
};

// Cambia la contraseña de un usuario existente, hasheándola.
userSchema.methods.setPassword = async function setPassword(newPassword) {
  this.password = await bcrypt.hash(newPassword, 10);
  await this.save();
};

// Migra usuarios creados con el modelo antiguo (solo tenían `name` en la BD, sin
// firstName/lastName/role). Usa el driver nativo porque el campo `name` no está
// en el schema de Mongoose.
// - Divide `name` en firstName/lastName.
// - Asigna role 'admin' a los correos de ADMIN_EMAILS; el resto 'user'.
// - Borra el campo legacy `name` del documento.
const ADMIN_EMAILS = [
  'darelisbatistag@gmail.com',
  'enmanuel676hd@gmail.com',
  'admin@lamar.com',
];

userSchema.statics.migrateLegacyUsers = async function migrateLegacyUsers() {
  const collection = this.collection; // driver nativo de MongoDB
  const legacyUsers = await collection.find({ name: { $exists: true } }).toArray();
  const results = [];

  for (const doc of legacyUsers) {
    const fullName = (doc.name || 'Admin').trim();
    const parts = fullName.split(/\s+/);
    const firstName = parts[0] || 'Admin';
    const lastName = parts.slice(1).join(' ') || '';

    const email = (doc.email || '').toLowerCase().trim();
    const role = ADMIN_EMAILS.includes(email) ? 'admin' : 'user';

    await collection.updateOne(
      { _id: doc._id },
      {
        $set: { firstName, lastName, role },
        $unset: { name: '' },
      },
    );

    results.push({ email: doc.email, firstName, lastName, role });
  }

  return results;
};

const User = mongoose.model('user', userSchema);
User.ROLES = ROLES;

module.exports = User;
