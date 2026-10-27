const router = require('express').Router();
const auth = require('../middlewares/auth');
const { login, register, logout } = require('../controllers/auth');
const { validateLogin, validateRegister } = require('../middlewares/validation');

// Públicas: cualquiera puede registrarse o iniciar sesión.
router.post('/login', validateLogin, login);
router.post('/register', validateRegister, register);

// Cerrar sesión: requiere token válido (aunque el servidor no guarda estado,
// se comprueba que quien llama está autenticado).
router.post('/logout', auth, logout);

module.exports = router;
