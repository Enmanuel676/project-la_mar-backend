const router = require('express').Router();
const { login, register, logout } = require('../controllers/auth');
const { validateLogin, validateRegister } = require('../middlewares/validation');
const { authLimiter } = require('../middlewares/rateLimit');

// Inicio de sesión (con rate limiting).
router.post('/login', authLimiter, validateLogin, login);

// Registro de nuevos usuarios (administradores, con rate limiting).
router.post('/register', authLimiter, validateRegister, register);

// Cierre de sesión: borra la cookie (sin exigir token, para poder salir aunque haya caducado).
// No lleva rate limiting: cerrar sesión debe ser siempre posible.
router.post('/logout', logout);

module.exports = router;
