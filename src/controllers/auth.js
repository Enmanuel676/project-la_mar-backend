const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/user');
const ApiError = require('../utils/ApiError');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findByCredentials(email, password);
    if (!user) {
      throw new ApiError(401, 'Correo o contraseña incorrectos.');
    }

    // En el token solo va el id: lo demás se puede consultar, y así no queda desfasado
    // si cambia el nombre o el correo.
    const token = jwt.sign({ _id: user._id }, env.jwtSecret, { algorithm: 'HS256', expiresIn: env.jwtExpiresIn });
    // El panel espera { token, user } y guarda `user` para mostrar el nombre.
    res.send({ token, user: { email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
}

module.exports = { login };
