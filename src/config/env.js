const path = require('path');

// La ruta es fija (la carpeta backend/) y no depende de desde dónde se lance el comando.
// Con el valor por defecto, dotenv busca el .env en la carpeta actual, y arrancar desde
// otro directorio daba "Falta la variable de entorno MONGODB_URI".
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Falla al arrancar, no cuando llega la primera petición: un servidor sin base de datos
// o sin secreto JWT no sirve de nada, y es mejor enterarse en el momento del despliegue.
const isProduction = process.env.NODE_ENV === 'production';

// Valores solo para desarrollo: así `npm run dev` arranca en un clon limpio, sin .env, contra
// un MongoDB local. En producción no se usan nunca: ahí la variable es obligatoria.
const DEV_DEFAULTS = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/la_mar',
  JWT_SECRET: 'dev-secret-solo-para-desarrollo-local',
};

function required(name) {
  const value = process.env[name] || (isProduction ? '' : DEV_DEFAULTS[name]);
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

const PLACEHOLDER_SECRET = 'cambia-este-valor-por-un-secreto-largo-y-aleatorio';
const jwtSecret = required('JWT_SECRET');

// En producción un secreto corto o el de ejemplo permitiría falsificar sesiones de admin.
if (isProduction && (jwtSecret.length < 32 || jwtSecret === PLACEHOLDER_SECRET)) {
  throw new Error('JWT_SECRET debe ser un valor aleatorio de al menos 32 caracteres en producción.');
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  mongoUri: required('MONGODB_URI'),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  trashRetentionDays: Number(process.env.TRASH_RETENTION_DAYS) || 30,
  // Correos de administradores. En desarrollo se usan valores por defecto para
  // permitir el registro y login de admins en local.
  adminEmails: process.env.ADMIN_EMAILS || 'darelisbatistag@gmail.com,enmanuel676hd@gmail.com',
  // Lista separada por comas; el .filter(Boolean) descarta entradas vacías (una coma sobrante).
  // En desarrollo se acepta además cualquier puerto de localhost: Vite usa el 5173, pero pasa
  // al 5174 (o al siguiente libre) si ya está ocupado, y `vite preview` usa el 4173. En
  // producción solo valen los orígenes de la lista.
  allowedOrigins: [
    ...(process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    ...(isProduction ? [] : [/^http:\/\/(localhost|127\.0\.0\.1):\d+$/]),
  ],
  // Opcionales al arrancar: sin bucket el resto de la API funciona en local y solo falla la
  // subida de fotos (con un mensaje claro). Las credenciales no pasan por aquí: el SDK de
  // Google lee solo GOOGLE_APPLICATION_CREDENTIALS, o la cuenta de servicio de la VM.
  gcsBucketName: process.env.GCS_BUCKET_NAME || '',
  gcsProjectId: process.env.GCS_PROJECT_ID || undefined,
};
