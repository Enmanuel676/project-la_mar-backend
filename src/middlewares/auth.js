const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

// Protege las rutas del panel. Espera la cabecera "Authorization: Bearer <token>".
module.exports = (req, res, next) => {
  const { authorization } = req.headers;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    next(new ApiError(401, 'Se requiere iniciar sesión.'));
    return;
  }

  try {
    const token = authorization.replace('Bearer ', '');
    // verify lanza si la firma no coincide o el token caducó; ambos casos son un 401.
    // Se fija el algoritmo para que nadie pueda elegir otro desde el propio token.
    req.user = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    next();
  } catch (err) {
    next(new ApiError(401, 'Sesión caducada. Vuelve a iniciar sesión.'));
  }
};
