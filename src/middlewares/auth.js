const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/user');
const ApiError = require('../utils/ApiError');
const { parseCookies } = require('../utils/sessionCookie');

// El token llega por dos vías:
// 1. Cabecera "Authorization: Bearer <token>": la que usa el panel, que guarda el token
//    en localStorage y lo añade en cada petición.
// 2. Cookie de sesión: la fija el login con Domain del dominio padre, así que también
//    llega al abrir la URL de la API directamente en otra pestaña y desde el sitio
//    público (localStorage no se comparte entre orígenes distintos; las cookies con
//    Domain sí se comparten entre subdominios).
function extractToken(req) {
  const { authorization } = req.headers;
  if (authorization && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }
  return parseCookies(req)[env.cookieName] || null;
}

// Protege las rutas del panel y del sitio. Acepta el token por cabecera Bearer o por
// la cookie de sesión. Carga el usuario completo de la base de datos para que las
// rutas puedan comprobar el rol (admin o user).
async function auth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    next(new ApiError(401, 'Se requiere iniciar sesión.'));
    return;
  }

  try {
    // verify lanza si la firma no coincide o el token caducó; ambos casos son un 401.
    // Se fija el algoritmo para que nadie pueda elegir otro desde el propio token.
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    // Cargar el usuario completo: el token solo tiene el id, pero para comprobar
    // permisos necesitamos el rol (que puede haber cambiado desde que se emitió).
    const user = await User.findById(payload._id);
    if (!user) {
      throw new ApiError(401, 'Sesión caducada. Vuelve a iniciar sesión.');
    }
    req.user = user;
    next();
  } catch (err) {
    if (err instanceof ApiError) {
      next(err);
    } else {
      next(new ApiError(401, 'Sesión caducada. Vuelve a iniciar sesión.'));
    }
  }
}

// Solo para rutas de administración: el usuario debe tener role 'admin'.
// Debe usarse después de `auth` (que carga req.user).
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    next(new ApiError(403, 'No tienes permisos de administrador.'));
    return;
  }
  next();
}

module.exports = auth;
module.exports.requireAdmin = requireAdmin;
