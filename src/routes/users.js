const router = require('express').Router();
const auth = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/auth');
const {
  validateUpdateUser,
  validateUserId,
  validateChangePassword,
} = require('../middlewares/validation');
const { getMe } = require('../controllers/auth');
const {
  listUsers,
  getUser,
  updateUser,
  deleteUser,
  changeUserPassword,
} = require('../controllers/users');

// Todas las rutas de usuarios requieren autenticación.
router.use(auth);

// `/me` va antes que `/:id`: si no, Express captura "me" como parámetro :id.
// Cualquier usuario autenticado puede consultar sus propios datos.
router.get('/me', getMe);

// El resto de rutas son solo para administradores.
router.use(requireAdmin);

router.get('/', listUsers);
router.get('/:id', validateUserId, getUser);
router.put('/:id', validateUpdateUser, updateUser);
router.delete('/:id', validateUserId, deleteUser);
router.post('/:id/change-password', validateChangePassword, changeUserPassword);

module.exports = router;
