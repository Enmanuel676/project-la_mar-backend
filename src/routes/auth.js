const router = require('express').Router();
const { login } = require('../controllers/auth');
const { validateLogin } = require('../middlewares/validation');

// Solo inicio de sesión. No hay POST /signup a propósito: las cuentas de administrador se
// crean desde la terminal con `npm run seed:admin` (ver scripts/createAdmin.js).
router.post('/login', validateLogin, login);

module.exports = router;
