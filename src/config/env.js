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

/**
 * Obtiene una variable de entorno con validación
 * @param {string} name - Nombre de la variable
 * @param {boolean} required - Si es obligatoria
 * @param {Function} validator - Función de validación opcional
 * @returns {*} Valor de la variable
 */
function getEnvVar(name, required = true, validator = null) {
  const value = process.env[name] || (isProduction ? '' : DEV_DEFAULTS[name]);

  if (!value && required) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }

  if (validator && value && !validator(value)) {
    throw new Error(`La variable ${name} tiene un valor inválido: ${value}`);
  }

  return value;
}

// Validaciones de configuración
const PLACEHOLDER_SECRET = 'cambia-este-valor-por-un-secreto-largo-y-aleatorio';

// Validar JWT_SECRET
const jwtSecret = getEnvVar('JWT_SECRET', true, (secret) => {
  // En producción, debe tener al menos 32 caracteres y no ser el placeholder
  if (isProduction) {
    return secret.length >= 32 && secret !== PLACEHOLDER_SECRET;
  }
  // En desarrollo, simplemente no debe estar vacío
  return secret.length > 0;
});

// Validación adicional para producción
if (isProduction) {
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET debe ser un valor aleatorio de al menos 32 caracteres en producción.');
  }
  if (jwtSecret === PLACEHOLDER_SECRET) {
    throw new Error('JWT_SECRET no puede ser el valor placeholder en producción.');
  }
}

// Advertencia en desarrollo si el secreto es muy corto
if (!isProduction && jwtSecret.length < 32 && !DEV_DEFAULTS.JWT_SECRET.includes(jwtSecret)) {
  console.warn('⚠ Advertencia: JWT_SECRET debería tener al menos 32 caracteres, incluso en desarrollo');
}

// Validar MONGODB_URI
// Validación básica de URI de MongoDB
const mongoUri = getEnvVar('MONGODB_URI', true, (uri) => uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://'));

// Validar PORT
const port = Number(getEnvVar('PORT', false)) || 3000;
if (port < 1024 || port > 65535) {
  throw new Error('PORT debe ser un número entre 1024 y 65535');
}

// Validar TRASH_RETENTION_DAYS
const trashRetentionDays = Number(getEnvVar('TRASH_RETENTION_DAYS', false)) || 30;
if (trashRetentionDays < 1 || trashRetentionDays > 365) {
  console.warn('⚠ Advertencia: TRASH_RETENTION_DAYS debería estar entre 1 y 365 días');
}

// Validar JWT_EXPIRES_IN
const jwtExpiresIn = getEnvVar('JWT_EXPIRES_IN', false) || '12h';

// Validar ADMIN_EMAILS
const adminEmailsRaw = getEnvVar('ADMIN_EMAILS', false) || '';
const adminEmails = adminEmailsRaw
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

// Validar ALLOWED_ORIGINS
const allowedOriginsRaw = getEnvVar('ALLOWED_ORIGINS', false) || '';

// En desarrollo, también permitir cualquier puerto de localhost
const isDevelopment = !isProduction;

// Lista separada por comas; el .filter(Boolean) descarta entradas vacías (una coma sobrante).
// En desarrollo se acepta además cualquier puerto de localhost: Vite usa el 5173, pero pasa
// al 5174 (o al siguiente libre) si ya está ocupado, y `vite preview` usa el 4173. En
// producción solo valen los orígenes de la lista.
const allowedOrigins = [
  ...allowedOriginsRaw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  ...(isDevelopment ? [/^http:\/\/(localhost|127\.0\.0\.1):\d+$/] : []),
];

// Validar GCS (opcional)
const gcsBucketName = getEnvVar('GCS_BUCKET_NAME', false) || '';
const gcsProjectId = getEnvVar('GCS_PROJECT_ID', false) || undefined;

// Log de configuración cargada (solo en desarrollo)
if (!isProduction) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('CONFIGURACIÓN CARGADA (Desarrollo)');
  console.log('='.repeat(60));
  console.log(`  Entorno: ${isProduction ? 'Producción' : 'Desarrollo'}`);
  console.log(`  Puerto: ${port}`);
  console.log(`  MongoDB: ${mongoUri}`);
  console.log(`  JWT Secret: ${jwtSecret.length > 0 ? `Configurado (${jwtSecret.length} chars)` : 'NO CONFIGURADO'}`);
  console.log(`  JWT Expires: ${jwtExpiresIn}`);
  console.log(`  Admin Emails: ${adminEmails.length > 0 ? adminEmails.join(', ') : 'ninguno'}`);
  console.log(`  Orígenes permitidos: ${allowedOrigins.length}`);
  console.log(`  GCS Bucket: ${gcsBucketName || 'No configurado'}`);
  console.log(`  Retención papelera: ${trashRetentionDays} días`);
  console.log(`${'='.repeat(60)}\n`);
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port,
  mongoUri,
  jwtSecret,
  jwtExpiresIn,
  trashRetentionDays,
  adminEmails: adminEmails.join(','),
  allowedOrigins,
  gcsBucketName,
  gcsProjectId,
  isProduction,
  isDevelopment,
};
