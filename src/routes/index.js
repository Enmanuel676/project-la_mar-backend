const router = require('express').Router();

router.use('/auth', require('./auth'));
router.use('/users', require('./users'));
router.use('/articles', require('./articles'));
router.use('/public', require('./public'));

module.exports = router;
