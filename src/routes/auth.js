const router = require('express').Router();
const { login } = require('../controllers/auth');
const { validateLogin } = require('../middlewares/validation');

router.post('/login', validateLogin, login);

module.exports = router;
