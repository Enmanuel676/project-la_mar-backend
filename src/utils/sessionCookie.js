const SESSION_COOKIE = 'lamar_token';

// Compartidas por login, sincronización y logout. nginx termina HTTPS en producción
// y comunica el protocolo original mediante X-Forwarded-Proto.
function sessionCookieOptions(req) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return {
    httpOnly: true, sameSite: 'lax', secure, path: '/',
  };
}

function setSessionCookie(req, res, token) {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(req));
}

module.exports = { SESSION_COOKIE, sessionCookieOptions, setSessionCookie };
