const router = require('express').Router();
const { apiLimiter } = require('../middlewares/rateLimit');

// Aplicar rate limiting a todas las rutas de la API
router.use(apiLimiter);

// Ruta principal que lista todos los endpoints disponibles
router.use('/', require('./api'));

router.use('/auth', require('./auth'));
router.use('/articles', require('./articles'));
router.use('/users', require('./users'));
router.use('/public', require('./public'));

module.exports = router;
