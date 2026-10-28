const router = require('express').Router();
const { apiLimiter, authLimiter } = require('../middlewares/rateLimit');
const { login, register } = require('../controllers/auth');
const { validateLogin, validateRegister } = require('../middlewares/validation');

// Aplicar rate limiting a todas las rutas de la API
router.use(apiLimiter);

// Ruta principal que lista todos los endpoints disponibles
router.use('/', require('./api'));

router.post('/signin', authLimiter, validateLogin, login);
router.post('/signup', authLimiter, validateRegister, register);
// Mantener los endpoints anteriores para clientes ya desplegados.
router.use('/auth', require('./auth'));
router.use('/articles', require('./articles'));
router.use('/users', require('./users'));
router.use('/public', require('./public'));

module.exports = router;
