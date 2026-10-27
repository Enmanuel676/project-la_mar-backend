const mongoose = require('mongoose');

const CATEGORIES = ['Anillos', 'Collares', 'Pendientes', 'Pulseras', 'Relojes'];
const CURRENCIES = ['USD', 'CUP'];

const articleSchema = new mongoose.Schema(
  {
    name: {
      type: String, required: true, trim: true, maxlength: 80,
    },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: CURRENCIES, default: 'USD' },
    stock: { type: Number, min: 0, default: null },
    category: { type: String, enum: CATEGORIES },
    // `collectionName` y no `collection`: Mongoose reserva `collection` para acceder a la
    // colección de Mongo. El toJSON de abajo lo devuelve como `collection`, que es lo que
    // esperan los dos frontends.
    collectionName: { type: String, trim: true, default: '' },
    materials: { type: String, trim: true, default: '' },
    description: {
      type: String, trim: true, maxlength: 600, default: '',
    },
    // `image` es la URL pública que pintan los frontends. `imagePath` es la ruta del archivo
    // dentro del bucket y hace falta para borrarlo: sacarla de la URL sería frágil.
    image: { type: String, trim: true, default: '' },
    imagePath: { type: String, default: '' },
    published: { type: Boolean, default: false },
    // Papelera: un artículo con deletedAt está "eliminado". No hay índice TTL: la purga
    // (borrar el documento y su imagen del bucket) la hace el propio servidor a los 30 días,
    // porque Mongo solo borraría el documento y la imagen quedaría huérfana.
    deletedAt: { type: Date },
    // Quién creó el artículo. Sirve para mostrar «creado por» en el panel.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
  },
  { timestamps: true },
);

articleSchema.set('toJSON', {
  transform(_doc, ret) {
    const json = { ...ret };
    json.id = ret._id.toString();
    json.collection = ret.collectionName;
    delete json._id;
    delete json.__v;
    delete json.collectionName;
    delete json.imagePath;
    // Si owner está populado, exponer ownerName y ownerEmail como espera el frontend.
    if (ret.owner && typeof ret.owner === 'object' && ret.owner.name) {
      json.ownerName = ret.owner.name;
      json.ownerEmail = ret.owner.email;
      json.owner = ret.owner._id ? ret.owner._id.toString() : ret.owner.toString();
    } else if (ret.owner) {
      json.owner = ret.owner.toString();
    }
    return json;
  },
});

const Article = mongoose.model('article', articleSchema);
Article.CATEGORIES = CATEGORIES;
Article.CURRENCIES = CURRENCIES;

module.exports = Article;
