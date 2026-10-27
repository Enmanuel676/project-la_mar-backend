const path = require('path');

// La ruta es fija (la carpeta backend/) y no depende de desde dónde se lance el comando.
// Con el valor por defecto, dotenv busca el .env en la carpeta actual, y arrancar desde
// otro directorio daba "Falta la variable de entorno MONGODB_URI".
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Falla al arrancar, no cuando llega la primera petición: un servidor sin base de datos
// o sin secreto JWT no sirve de nada, y es mejor enterarse en el momento del despliegue.
function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

const PLACEHOLDER_SECRET = 'cambia-este-valor-por-un-secreto-largo-y-aleatorio';
const jwtSecret = required('JWT_SECRET');

// En producción un secreto corto o el de ejemplo permitiría falsificar sesiones de admin.
if (process.env.NODE_ENV === 'production' && (jwtSecret.length < 32 || jwtSecret === PLACEHOLDER_SECRET)) {
  throw new Error('JWT_SECRET debe ser un valor aleatorio de al menos 32 caracteres en producción.');
}

// Convierte el formato de expiración de jsonwebtoken ('12h', '30m', '7d', o segundos)
// a milisegundos, para poder darle el mismo maxAge a la cookie de sesión. Si el valor
// no se entiende, se usa el mismo valor por defecto que jsonwebtoken aplica a los JWT.
function expiresInToMs(value) {
  const raw = String(value || '12h').trim();
  if (/^\d+$/.test(raw)) {
    return Number(raw) * 1000;
  }
  const match = /^(\d+)\s*(ms|s|m|h|d|w|y)$/.exec(raw);
  if (!match) {
    return 12 * 60 * 60 * 1000;
  }
  const factors = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000,
  };
  return Number(match[1]) * factors[match[2]];
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  mongoUri: required('MONGODB_URI'),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  jwtExpiresMs: expiresInToMs(process.env.JWT_EXPIRES_IN || '12h'),
  // Cookie de sesión: además del header Bearer (que guarda el panel en localStorage),
  // el login fija el JWT en una cookie httpOnly para que la sesión también valga al
  // entrar directo a la URL de la API y desde otros subdominios (sitio público).
  // COOKIE_DOMAIN con el dominio padre ('.lamarjoyeria.mooo.com') la comparte entre
  // admin., api. y el sitio; vacío (desarrollo) la deja solo para el host que la fija.
  cookieName: 'lamar_token',
  cookieDomain: process.env.COOKIE_DOMAIN || '',
  // Secure solo en producción: en desarrollo se accede por http://localhost y un
  // atributo Secure haría que el navegador descartara la cookie.
  cookieSecure: process.env.NODE_ENV === 'production',
  // Lax: la cookie viaja en la navegación directa a la URL (abrir api/users/me en una
  // pestaña nueva) y en las peticiones entre subdominios del mismo sitio, pero no en
  // peticiones cross-site de terceros (protección CSRF básica).
  cookieSameSite: 'lax',
  trashRetentionDays: Number(process.env.TRASH_RETENTION_DAYS) || 30,
  // Lista separada por comas; el .filter(Boolean) descarta entradas vacías (una coma sobrante).
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  // Opcionales al arrancar: sin bucket el resto de la API funciona en local y solo falla la
  // subida de fotos (con un mensaje claro). Las credenciales no pasan por aquí: el SDK de
  // Google lee solo GOOGLE_APPLICATION_CREDENTIALS, o la cuenta de servicio de la VM.
  gcsBucketName: process.env.GCS_BUCKET_NAME || '',
  gcsProjectId: process.env.GCS_PROJECT_ID || undefined,
};
