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

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  mongoUri: required('MONGODB_URI'),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
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
