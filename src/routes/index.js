const router = require('express').Router();

// Ruta principal que lista todos los endpoints disponibles
router.use('/', require('./api'));

router.use('/auth', require('./auth'));
// Alias para /signup como requiere la Etapa 2
router.use('/signup', require('./auth'));
router.use('/articles', require('./articles'));
router.use('/users', require('./users'));
router.use('/public', require('./public'));

module.exports = router;
