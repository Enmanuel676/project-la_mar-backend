#!/usr/bin/env node

/**
 * Script de auditoría para el backend de La Mar
 *
 * Ejecución:
 *   node scripts/audit.js
 *
 * Este script verifica la configuración y el entorno antes de iniciar el servidor,
 * identificando problemas potenciales.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { execSync } = require('child_process');
const env = require('../src/config/env');

console.log(`\n${'='.repeat(80)}`);
console.log('AUDITORIA DEL BACKEND DE LA MAR');
console.log(`${'='.repeat(80)}\n`);

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function logInfo(message) {
  console.log(`${colors.cyan}[INFO]${colors.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`${colors.green}[OK]${colors.reset} ${message}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}[WARN]${colors.reset} ${message}`);
}

function logError(message) {
  console.log(`${colors.red}[ERROR]${colors.reset} ${message}`);
}

function logHeader(title) {
  console.log(`\n${colors.blue}${title}${colors.reset}`);
  console.log('-'.repeat(title.length));
}

// Estado de la auditoría
const state = {
  errors: [],
  warnings: [],
  checks: [],
};

// =============================================================================
// 1. Verificar sistema operativo y recursos
// =============================================================================
logHeader('1. SISTEMA OPERATIVO');

const systemInfo = {
  hostname: os.hostname(),
  platform: os.platform(),
  arch: os.arch(),
  cpus: os.cpus().length,
  totalMemory: Math.round(os.totalmem() / (1024 * 1024)), // MB
  freeMemory: Math.round(os.freemem() / (1024 * 1024)), // MB
  uptime: Math.round(os.uptime() / 60), // minutos
};

logInfo(`Hostname: ${systemInfo.hostname}`);
logInfo(`Plataforma: ${systemInfo.platform} (${systemInfo.arch})`);
logInfo(`CPUs: ${systemInfo.cpus}`);
logInfo(`Memoria: ${systemInfo.freeMemory}MB libres de ${systemInfo.totalMemory}MB`);
logInfo(`Tiempo de actividad: ${systemInfo.uptime} minutos`);

// Verificar memoria
const memoryUsage = (systemInfo.totalMemory - systemInfo.freeMemory) / systemInfo.totalMemory;
if (memoryUsage > 0.8) {
  state.warnings.push(`Alto uso de memoria: ${(memoryUsage * 100).toFixed(1)}%`);
  logWarning(`Alto uso de memoria: ${(memoryUsage * 100).toFixed(1)}%`);
} else {
  state.checks.push('Memoria del sistema OK');
  logSuccess(`Memoria disponible: ${(100 - memoryUsage * 100).toFixed(1)}%`);
}

// =============================================================================
// 2. Verificar Node.js
// =============================================================================
logHeader('2. NODE.JS');

const nodeVersion = process.version;
const nodeMajorVersion = parseInt(nodeVersion.split('.')[0].replace('v', ''), 10);

logInfo(`Versión: ${nodeVersion}`);

// Verificar versión mínima
if (nodeMajorVersion >= 20) {
  state.checks.push('Versión de Node.js OK');
  logSuccess('Versión de Node.js compatible (>=20.9.0)');
} else {
  state.errors.push(`Versión de Node.js demasiado antigua: ${nodeVersion} (requerido >=20.9.0)`);
  logError(`Versión de Node.js demasiado antigua: ${nodeVersion} (requerido >=20.9.0)`);
}

// Verificar npm/yarn
try {
  const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
  logInfo(`npm: ${npmVersion}`);
  state.checks.push('npm disponible');
} catch (err) {
  state.warnings.push('npm no disponible');
  logWarning('npm no disponible');
}

// =============================================================================
// 3. Verificar MongoDB
// =============================================================================
logHeader('3. MONGODB');

// Verificar si MongoDB está instalado
try {
  const mongoVersion = execSync('mongod --version', { encoding: 'utf8' }).trim();
  logInfo(`Versión: ${mongoVersion.split('\n')[0]}`);
  state.checks.push('MongoDB está instalado');
} catch (err) {
  state.errors.push('MongoDB no está instalado o no está en PATH');
  logError('MongoDB no está instalado o no está en PATH');
}

// Verificar si MongoDB está corriendo
try {
  // Intentar conectar a MongoDB
  logInfo('URI de MongoDB configurada');

  // Intentar conexión rápida
  try {
    const testConnection = async () => {
      try {
        await mongoose.connect(env.mongoUri, {
          connectTimeoutMS: 3000,
          serverSelectionTimeoutMS: 3000,
        });
        await mongoose.connection.db.command({ ping: 1 });
        state.checks.push('Conexión a MongoDB exitosa');
        logSuccess('Conexión a MongoDB exitosa');
        await mongoose.disconnect();
      } catch (err) {
        state.errors.push(`No se puede conectar a MongoDB: ${err.message}`);
        logError(`No se puede conectar a MongoDB: ${err.message}`);
        if (err.name === 'MongoNetworkError') {
          logInfo('  - Verificar que MongoDB esté corriendo');
          logInfo('  - Verificar configuración de firewall');
        } else if (err.code === 'ECONNREFUSED') {
          logInfo('  - Verificar que MongoDB esté escuchando en el puerto correcto');
        }
      }
    };

    // Ejecutar conexión de prueba (síncrona para el script)
    // No podemos usar async/await aquí, así que lo marcamos como pendiente
    state.warnings.push('Conexión a MongoDB no verificada (ejecutando en background)');
    testConnection().catch(() => {});
  } catch (err) {
    state.errors.push(`Error al cargar configuración de MongoDB: ${err.message}`);
    logError(`Error al cargar configuración de MongoDB: ${err.message}`);
  }
} catch (err) {
  state.errors.push(`No se puede verificar MongoDB: ${err.message}`);
  logError(`No se puede verificar MongoDB: ${err.message}`);
}

// =============================================================================
// 4. Verificar configuración del proyecto
// =============================================================================
logHeader('4. CONFIGURACIÓN DEL PROYECTO');

// Verificar .env
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  state.checks.push('.env existe');
  logSuccess('.env existe');

  // Verificar permisos
  const envStats = fs.statSync(envPath);
  logInfo(`Permisos: ${envStats.mode.toString(8)}`);

  // Leer y verificar variables clave
  try {
    dotenv.config({ path: envPath });

    const requiredVars = ['MONGODB_URI', 'JWT_SECRET'];
    const missingVars = requiredVars.filter((varName) => !process.env[varName]);

    if (missingVars.length === 0) {
      state.checks.push('Todas las variables de entorno obligatorias están configuradas');
      logSuccess('Todas las variables de entorno obligatorias están configuradas');
    } else {
      state.errors.push(`Faltan variables de entorno: ${missingVars.join(', ')}`);
      logError(`Faltan variables de entorno: ${missingVars.join(', ')}`);
    }

    // Verificar JWT_SECRET
    if (process.env.JWT_SECRET) {
      const jwtSecret = process.env.JWT_SECRET;
      if (jwtSecret.length < 32) {
        state.warnings.push(`JWT_SECRET es demasiado corto (${jwtSecret.length} caracteres, recomendado >=32)`);
        logWarning(`JWT_SECRET es demasiado corto (${jwtSecret.length} caracteres, recomendado >=32)`);
      } else {
        state.checks.push('JWT_SECRET tiene longitud adecuada');
        logSuccess('JWT_SECRET tiene longitud adecuada');
      }
    }

    // Verificar PORT
    if (process.env.PORT) {
      const port = parseInt(process.env.PORT, 10);
      if (port >= 1024 && port <= 65535) {
        state.checks.push('Puerto configurado correctamente');
        logSuccess(`Puerto: ${port}`);
      } else {
        state.errors.push(`Puerto inválido: ${port} (debe estar entre 1024 y 65535)`);
        logError(`Puerto inválido: ${port} (debe estar entre 1024 y 65535)`);
      }
    } else {
      state.checks.push('Puerto por defecto (3000)');
      logInfo('Puerto por defecto: 3000');
    }
  } catch (err) {
    state.errors.push(`Error al leer .env: ${err.message}`);
    logError(`Error al leer .env: ${err.message}`);
  }
} else {
  state.warnings.push('.env no existe');
  logWarning('.env no existe');
}

// =============================================================================
// 5. Verificar dependencias
// =============================================================================
logHeader('5. DEPENDENCIAS');

const packageJsonPath = path.resolve(__dirname, '../package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  logInfo(`Nombre: ${packageJson.name}`);
  logInfo(`Versión: ${packageJson.version}`);

  // Verificar dependencias clave
  const requiredDependencies = [
    'express', 'mongoose', 'jsonwebtoken', 'bcrypt', 'cors', 'dotenv',
  ];

  const missingDeps = requiredDependencies.filter(
    (dep) => !packageJson.dependencies || !packageJson.dependencies[dep],
  );

  if (missingDeps.length === 0) {
    state.checks.push('Todas las dependencias clave están instaladas');
    logSuccess('Todas las dependencias clave están instaladas');
  } else {
    state.errors.push(`Faltan dependencias: ${missingDeps.join(', ')}`);
    logError(`Faltan dependencias: ${missingDeps.join(', ')}`);
  }

  // Verificar node_modules
  const nodeModulesPath = path.resolve(__dirname, '../node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    state.checks.push('node_modules existe');
    logSuccess('node_modules existe');
  } else {
    state.warnings.push('node_modules no existe');
    logWarning('node_modules no existe (ejecutar npm install)');
  }
} else {
  state.errors.push('package.json no existe');
  logError('package.json no existe');
}

// =============================================================================
// 6. Verificar puertos disponibles
// =============================================================================
logHeader('6. PUERTOS DISPONIBLES');

// Puerto por defecto
const defaultPort = 3000;

// Verificar si el puerto está en uso (Mac/Linux)
try {
  const server = net.createServer();

  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      state.errors.push(`El puerto ${defaultPort} ya está en uso`);
      logError(`El puerto ${defaultPort} ya está en uso`);

      // Intentar encontrar el PID
      try {
        const lsofOutput = execSync(`lsof -i :${defaultPort}`, { encoding: 'utf8' });
        const match = lsofOutput.match(/\n\w+\s+(\d+)\s+/);
        if (match) {
          const pid = match[1];
          logInfo(`  PID del proceso: ${pid}`);
          logInfo(`  Para liberar el puerto: kill -9 ${pid}`);
        }
      } catch (lsofErr) {
        // lsof no disponible
      }
    } else {
      state.warnings.push(`Problema al verificar el puerto ${defaultPort}: ${err.message}`);
      logWarning(`Problema al verificar el puerto ${defaultPort}: ${err.message}`);
    }
    server.close();
  });

  server.once('listening', () => {
    state.checks.push(`Puerto ${defaultPort} disponible`);
    logSuccess(`Puerto ${defaultPort} disponible`);
    server.close();
  });

  server.listen(defaultPort);

  // Esperar un momento para que se resuelva el evento
  setTimeout(() => {
    // Si el server no se cerró, cerrarlo manualmente
    if (!server.listening) {
      server.close();
    }
  }, 1000);
} catch (err) {
  state.warnings.push(`No se puede verificar el puerto ${defaultPort}: ${err.message}`);
  logWarning(`No se puede verificar el puerto ${defaultPort}: ${err.message}`);
}

// =============================================================================
// 7. Verificar directorios
// =============================================================================
logHeader('7. DIRECTORIOS');

const requiredDirs = [
  path.resolve(__dirname, '../logs'),
  path.resolve(__dirname, '../src'),
  path.resolve(__dirname, '../test'),
];

requiredDirs.forEach((dir) => {
  if (fs.existsSync(dir)) {
    state.checks.push(`Directorio ${path.basename(dir)} existe`);
    logSuccess(`Directorio ${path.basename(dir)} existe`);
  } else {
    state.warnings.push(`Directorio ${path.basename(dir)} no existe`);
    logWarning(`Directorio ${path.basename(dir)} no existe`);
  }
});

// =============================================================================
// RESUMEN
// =============================================================================

// Esperar un momento para que se completen todas las verificaciones asíncronas
setTimeout(() => {
  logHeader('RESUMEN');

  const totalChecks = state.checks.length + state.warnings.length + state.errors.length;
  const successRate = Math.round((state.checks.length / totalChecks) * 100);

  console.log(`\n${colors.cyan}Checks pasados:${colors.reset} ${state.checks.length}`);
  console.log(`${colors.yellow}Advertencias:${colors.reset} ${state.warnings.length}`);
  console.log(`${colors.red}Errores:${colors.reset} ${state.errors.length}`);
  console.log(`\n${colors.cyan}Tasa de éxito:${colors.reset} ${successRate}%`);

  if (state.errors.length > 0) {
    logHeader('ERRORES ENCONTRADOS');
    state.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${colors.red}${error}${colors.reset}`);
    });

    console.log(`\n${'='.repeat(80)}`);
    console.log(`${colors.red}AUDITORIA FALLIDA${colors.reset}: No se recomienda iniciar el servidor`);
    console.log(`${'='.repeat(80)}\n`);
    process.exit(1);
  } else if (state.warnings.length > 0) {
    logHeader('ADVERTENCIAS');
    state.warnings.forEach((warning, index) => {
      console.log(`  ${index + 1}. ${colors.yellow}${warning}${colors.reset}`);
    });

    console.log(`\n${'='.repeat(80)}`);
    console.log(`${colors.yellow}AUDITORIA CON ADVERTENCIAS${colors.reset}`);
    console.log(`${'='.repeat(80)}\n`);
    process.exit(0);
  } else {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${colors.green}AUDITORIA EXITOSA${colors.reset}: El servidor debería funcionar correctamente`);
    console.log(`${'='.repeat(80)}\n`);
    process.exit(0);
  }
}, 2000);
