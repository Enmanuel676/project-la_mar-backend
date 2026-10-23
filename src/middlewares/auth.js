const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

// Nombre de la cookie de sesión. El login la fija además de devolver el token en el cuerpo:
// así el navegador manda la credencial solo al entrar a la API directamente (escribir la URL
// a mano, p. ej. /api/users/me), sin que nadie tenga que pegar una cabecera.
const SESSION_COOKIE = 'lamar_token';

// Lee una cookie por nombre de la cabecera Cookie (sin depender de cookie-parser).
function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const parts = header.split(';');
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const eq = part.indexOf('=');
    if (eq >= 0 && part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

// Protege las rutas del panel. Acepta el token en la cabecera "Authorization: Bearer <token>"
// (lo que usa el panel, que guarda el token en sessionStorage por pestaña) o en la cookie
// de sesión (lo que manda el navegador solo al entrar directamente a la API). La cabecera
// gana si las dos existen: dentro de la app cada pestaña consulta con su propia cuenta.
module.exports = (req, res, next) => {
  const { authorization } = req.headers;
  const bearer = authorization && authorization.startsWith('Bearer ')
    ? authorization.replace('Bearer ', '')
    : null;
  const token = bearer || getCookie(req, SESSION_COOKIE);

  if (!token) {
    next(new ApiError(401, 'Se requiere iniciar sesión.'));
    return;
  }

  try {
    // verify lanza si la firma no coincide o el token caducó; ambos casos son un 401.
    // Se fija el algoritmo para que nadie pueda elegir otro desde el propio token.
    req.user = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    next();
  } catch (err) {
    next(new ApiError(401, 'Sesión caducada. Vuelve a iniciar sesión.'));
  }
};

module.exports.SESSION_COOKIE = SESSION_COOKIE;
