const router = require('express').Router();
const { celebrate, Joi, Segments } = require('celebrate');
const validator = require('validator');
const auth = require('../middlewares/auth');
const attachUser = require('../middlewares/attachUser');
const { register } = require('../controllers/auth');
const { validateRegister } = require('../middlewares/validation');
const isAdmin = require('../middlewares/isAdmin');
const {
  getUsers,
  getUser,
  getMe,
  updateUser,
  deleteUser,
  changePassword,
} = require('../controllers/users');

// Todas las rutas de este archivo requieren autenticación.
router.use(auth);
router.use(attachUser);

// Datos del usuario autenticado: solo necesita token, no ser admin (cualquiera puede
// consultar su propia cuenta). Se declara ANTES de isAdmin porque Express procesa
// middlewares y rutas en orden: si estuviera debajo, un usuario normal no podría
// ver sus propios datos. También debe ir antes que '/:id', o "me" se interpretaría
// como un identificador.
router.get('/me', getMe);

// El resto de la gestión de usuarios (listar, editar, borrar...) es solo para admins.
router.use(isAdmin);

const messages = {
  'any.required': 'El campo {#label} es obligatorio.',
  'string.empty': 'El campo {#label} no puede estar vacío.',
  'string.min': 'El campo {#label} debe tener al menos {#limit} caracteres.',
  'string.max': 'El campo {#label} no puede superar los {#limit} caracteres.',
  'object.unknown': 'El campo {#label} no está permitido.',
};

const validate = (schema) => celebrate(schema, { messages });

const isEmail = (value, helpers) => (
  validator.isEmail(value) ? value : helpers.message('El correo electrónico no es válido.')
);

const isMongoId = (value, helpers) => (
  validator.isMongoId(value) ? value : helpers.message('El identificador no es válido.')
);

const idParam = Joi.object().keys({
  id: Joi.string().required().custom(isMongoId),
});

// Listar todos los usuarios
router.get('/', getUsers);
router.post('/', validateRegister, register);

// Obtener un usuario por ID
router.get('/:id', validate({ [Segments.PARAMS]: idParam }), getUser);

// Actualizar un usuario (nombre, correo, rol)
router.put('/:id', validate({
  [Segments.PARAMS]: idParam,
  [Segments.BODY]: Joi.object().keys({
    name: Joi.string().trim().min(1).max(100)
      .label('nombre'),
    email: Joi.string().trim().lowercase().custom(isEmail)
      .label('correo'),
    role: Joi.string().valid('admin', 'user').label('rol'),
  }),
}), updateUser);

// Eliminar un usuario
router.delete('/:id', validate({ [Segments.PARAMS]: idParam }), deleteUser);

// Cambiar contraseña de un usuario
router.post('/:id/change-password', validate({
  [Segments.PARAMS]: idParam,
  [Segments.BODY]: Joi.object().keys({
    password: Joi.string().required().min(8).max(128)
      .label('contraseña'),
  }),
}), changePassword);

module.exports = router;
