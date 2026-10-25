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
    // Opciones de verificación: solo permitir HS256
    const options = { algorithms: ['HS256'] };

    req.user = jwt.verify(token, env.jwtSecret, options);

    // Validación adicional: asegurar que el token tenga _id
    if (!req.user || !req.user._id) {
      throw new Error('Token inválido: falta el ID de usuario');
    }

    next();
  } catch (err) {
    // Diferenciar entre token inválido y token expirado para mensajes más precisos
    let message = 'Sesión caducada. Vuelve a iniciar sesión.';
    if (err.name === 'TokenExpiredError') {
      message = 'Sesión caducada. Vuelve a iniciar sesión.';
    } else if (err.name === 'JsonWebTokenError') {
      message = 'Token inválido. Inicia sesión de nuevo.';
    }

    next(new ApiError(401, message));
  }
};

module.exports.SESSION_COOKIE = SESSION_COOKIE;
