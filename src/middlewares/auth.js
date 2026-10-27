const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { SESSION_COOKIE, setSessionCookie } = require('../utils/sessionCookie');

// Lee una cookie por nombre de la cabecera Cookie (sin depender de cookie-parser).
function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const parts = header.split(';');
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const eq = part.indexOf('=');
    if (eq >= 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        // Una cookie dañada no debe impedir recuperar la sesión con un Bearer válido.
        return null;
      }
    }
  }
  return null;
}

// Protege las rutas del panel. Acepta el token en la cabecera "Authorization: Bearer <token>"
// (lo que usa el panel, que guarda el token en localStorage) o en la cookie
// de sesión (lo que manda el navegador solo al entrar directamente a la API). La cabecera
// gana si las dos existen: la cookie debe reflejar la sesión actual del panel.
module.exports = (req, res, next) => {
  const { authorization } = req.headers;
  const bearer = authorization && authorization.startsWith('Bearer ')
    ? authorization.replace('Bearer ', '')
    : null;
  const cookie = getCookie(req, SESSION_COOKIE);
  const token = bearer || cookie;

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

    // localStorage puede conservar el token aunque se pierda la cookie de sesión.
    // Restaurarla solo después de verificar el JWT permite abrir la API en otra ventana
    // al volver a cargar el panel, sin exigir un nuevo login ni extender la vida del token.
    if (bearer && bearer !== cookie) {
      setSessionCookie(req, res, bearer);
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
