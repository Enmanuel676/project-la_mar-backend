const env = require('../config/env');

// Parsea la cabecera Cookie a mano para no depender de cookie-parser. Solo se usa para
// leer la cookie de sesión: su valor es un JWT (letras, dígitos, '-', '_' y '.'), así que
// no hace falta decodeURIComponent ni manejar casos raros de comillas.
function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie;
  if (!header) {
    return cookies;
  }
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) {
      return;
    }
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) {
      cookies[name] = value;
    }
  });
  return cookies;
}

// Opciones comunes de la cookie de sesión. `domain: undefined` hace que Express no
// envíe el atributo Domain (cookie solo para el host que la fija, útil en desarrollo).
function cookieOptions(overrides) {
  return Object.assign(
    {
      httpOnly: true,
      secure: env.cookieSecure,
      sameSite: env.cookieSameSite,
      domain: env.cookieDomain || undefined,
      path: '/',
    },
    overrides,
  );
}

// Fija la cookie de sesión con el mismo tiempo de vida que el JWT. httpOnly: el
// JavaScript del navegador no puede leerla (a diferencia del token en localStorage),
// así que un XSS no la roba directamente; el middleware la lee del servidor.
function setSessionCookie(res, token) {
  res.cookie(env.cookieName, token, cookieOptions({ maxAge: env.jwtExpiresMs }));
}

// Borrar la cookie exige repetir domain y path: sin ellos el navegador no la reconocería
// como la misma cookie y dejaría la vieja.
function clearSessionCookie(res) {
  res.clearCookie(env.cookieName, cookieOptions());
}

module.exports = { parseCookies, setSessionCookie, clearSessionCookie };
