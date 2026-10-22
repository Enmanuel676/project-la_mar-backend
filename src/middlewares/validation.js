const { celebrate, Joi, Segments } = require('celebrate');
const validator = require('validator');
const Article = require('../models/article');

// Mensajes de Joi en español. `{#label}` es el nombre legible de cada campo (ver .label()
// en los esquemas), para que la persona usuaria no lea "price" sino "precio".
const messages = {
  'any.required': 'El campo {#label} es obligatorio.',
  'any.only': 'El campo {#label} no tiene un valor permitido.',
  'string.base': 'El campo {#label} debe ser texto.',
  'string.empty': 'El campo {#label} no puede estar vacío.',
  'string.min': 'El campo {#label} debe tener al menos {#limit} caracteres.',
  'string.max': 'El campo {#label} no puede superar los {#limit} caracteres.',
  'number.base': 'El campo {#label} debe ser un número.',
  'number.integer': 'El campo {#label} debe ser un número entero.',
  'number.min': 'El campo {#label} no puede ser menor que {#limit}.',
  'boolean.base': 'El campo {#label} debe ser verdadero o falso.',
  'object.unknown': 'El campo {#label} no está permitido.',
};

// Un solo punto de entrada: todos los validadores comparten idioma de mensajes.
const validate = (schema) => celebrate(schema, { messages });

// Con validator y no con Joi.string().email(): es la librería que ya usa el modelo, y así
// las dos capas (petición y base de datos) aceptan exactamente los mismos correos.
const isEmail = (value, helpers) => (
  validator.isEmail(value) ? value : helpers.message('El correo electrónico no es válido.')
);

const isMongoId = (value, helpers) => (
  validator.isMongoId(value) ? value : helpers.message('El identificador no es válido.')
);

// Hacen falta los tipos exactos: sin comprobar que sean texto, alguien podría mandar
// { "email": { "$ne": null } } y Mongo lo trataría como un operador, no como un correo.
const validateLogin = validate({
  [Segments.BODY]: Joi.object().keys({
    email: Joi.string().required().custom(isEmail).label('correo'),
    password: Joi.string().required().max(128).label('contraseña'),
  }),
});

// Validación para el registro de nuevos usuarios.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

const validateRegister = validate({
  [Segments.BODY]: Joi.object().keys({
    firstName: Joi.string().trim().min(1).max(50)
      .required()
      .label('nombre'),
    lastName: Joi.string().trim().min(1).max(50)
      .required()
      .label('apellido'),
    email: Joi.string().required().custom(isEmail).label('correo'),
    password: Joi.string().required().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH)
      .label('contraseña'),
  }),
});

const idParam = Joi.object().keys({
  id: Joi.string().required().custom(isMongoId),
});

// El cuerpo llega como texto cuando la petición es multipart (por la foto): "12.5", "3" y
// "true". Joi convierte esos textos al tipo real, y celebrate deja el resultado ya
// convertido en req.body.
const articleFields = {
  name: Joi.string().trim().max(80).label('nombre'),
  price: Joi.number().min(0).label('precio'),
  currency: Joi.string().valid(...Article.CURRENCIES).label('moneda'),
  stock: Joi.number().integer().min(0).label('existencias'),
  category: Joi.string().valid(...Article.CATEGORIES).label('categoría'),
  collection: Joi.string().trim().allow('').max(80)
    .label('colección'),
  materials: Joi.string().trim().allow('').max(200)
    .label('materiales'),
  description: Joi.string().trim().allow('').max(600)
    .label('descripción'),
  published: Joi.boolean().label('publicado'),
  // La imagen solo cambia subiendo un archivo; esto es para quitarla sin poner otra.
  removeImage: Joi.boolean().label('quitar imagen'),
};

// Crear: lo esencial es obligatorio y lo demás tiene valor por defecto.
const createBody = Joi.object().keys({
  ...articleFields,
  name: articleFields.name.required(),
  price: articleFields.price.required(),
  category: articleFields.category.required(),
  currency: articleFields.currency.default('USD'),
  // Vacío o null = sin límite de existencias (null en la base de datos). El panel manda
  // null en JSON y "" cuando la petición lleva foto (multipart), así que se aceptan los dos.
  stock: articleFields.stock.allow(null).empty('').default(null),
  collection: articleFields.collection.default(''),
  materials: articleFields.materials.default(''),
  description: articleFields.description.default(''),
  published: articleFields.published.default(false),
  removeImage: articleFields.removeImage.default(false),
});

// Editar: todo es opcional y sin valores por defecto. El panel también lo usa para cambios
// sueltos (por ejemplo, solo { published: true }), y un valor por defecto pisaría lo que
// ya hay guardado. El stock vacío se acepta aquí y el controlador lo convierte en null.
const updateBody = Joi.object().keys({
  ...articleFields,
  stock: articleFields.stock.allow('', null),
});

const validateArticle = validate({ [Segments.BODY]: createBody });

const validateArticleId = validate({ [Segments.PARAMS]: idParam });

const validateArticleUpdate = validate({
  [Segments.BODY]: updateBody,
  [Segments.PARAMS]: idParam,
});

module.exports = {
  validateLogin,
  validateRegister,
  validateArticle,
  validateArticleId,
  validateArticleUpdate,
};
