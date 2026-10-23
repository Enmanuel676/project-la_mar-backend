const router = require('express').Router();
const { login, register, logout } = require('../controllers/auth');
const { validateLogin, validateRegister } = require('../middlewares/validation');

// Inicio de sesión.
router.post('/login', validateLogin, login);

// Registro de nuevos usuarios (administradores).
router.post('/register', validateRegister, register);

// Cierre de sesión: borra la cookie (sin exigir token, para poder salir aunque haya caducado).
router.post('/logout', logout);

module.exports = router;
