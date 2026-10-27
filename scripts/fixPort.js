#!/usr/bin/env node

/**
 * Script para liberar el puerto 3000 y reiniciar el backend
 * 
 * Ejecución:
 *   node scripts/fixPort.js [--kill] [--restart] [--port PORT]
 * 
 * Opciones:
 *   --kill       : Mata el proceso actual en el puerto 3000
 *   --restart    : Mata el proceso y reinicia el backend
 *   --port PORT  : Usa un puerto diferente (ej: --port 3001)
 */

const { execSync, spawn } = require('child_process');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function logInfo(message) {
  console.log(`${colors.blue}[INFO]${colors.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`${colors.green}[OK]${colors.reset} ${message}`);
}

function logError(message) {
  console.log(`${colors.red}[ERROR]${colors.reset} ${message}`);
}

// Parsear argumentos
const args = process.argv.slice(2);
const options = {
  kill: args.includes('--kill'),
  restart: args.includes('--restart'),
  port: null,
};

// Buscar el puerto
const portArgIndex = args.indexOf('--port');
if (portArgIndex !== -1 && portArgIndex + 1 < args.length) {
  options.port = parseInt(args[portArgIndex + 1], 10);
}

const DEFAULT_PORT = options.port || 3000;

console.log('\n' + '='.repeat(60));
console.log('FIX PORT SCRIPT');
console.log('='.repeat(60) + '\n');

// Verificar si el puerto está en uso
function checkPort(port) {
  try {
    const net = require('net');
    const server = net.createServer();
    
    return new Promise((resolve) => {
      server.once('error', (err) => {
        server.close();
        resolve(err.code === 'EADDRINUSE');
      });
      
      server.once('listening', () => {
        server.close();
        resolve(false);
      });
      
      server.listen(port);
    });
  } catch (err) {
    return Promise.resolve(false);
  }
}

// Obtener PID del proceso en el puerto
function getPidOnPort(port) {
  try {
    const output = execSync(`lsof -t -i :${port}`, { encoding: 'utf8' }).trim();
    return output.split('\n').filter(line => line.trim() !== '');
  } catch (err) {
    return [];
  }
}

// Matar procesos
function killProcesses(pids) {
  pids.forEach(pid => {
    try {
      execSync(`kill -9 ${pid}`);
      logSuccess(`Proceso ${pid} terminado`);
    } catch (err) {
      logError(`No se pudo matar el proceso ${pid}: ${err.message}`);
    }
  });
}

// Iniciar backend
function startBackend(port) {
  const serverPath = path.resolve(__dirname, '../src/server.js');
  const nodeProcess = spawn('node', [serverPath], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: port.toString() },
    stdio: 'inherit',
  });
  
  nodeProcess.on('error', (err) => {
    logError(`Error al iniciar el backend: ${err.message}`);
  });
  
  nodeProcess.on('exit', (code) => {
    if (code !== 0) {
      logError(`Backend terminado con código ${code}`);
    }
  });
  
  return nodeProcess;
}

// Función principal
async function main() {
  const isInUse = await checkPort(DEFAULT_PORT);
  
  if (!isInUse) {
    logSuccess(`El puerto ${DEFAULT_PORT} está disponible`);
    
    if (options.restart) {
      logInfo(`Iniciando backend en el puerto ${DEFAULT_PORT}...`);
      startBackend(DEFAULT_PORT);
    }
    
    return;
  }
  
  logInfo(`El puerto ${DEFAULT_PORT} está en uso`);
  
  const pids = getPidOnPort(DEFAULT_PORT);
  
  if (pids.length === 0) {
    logError(`No se encontró ningún proceso usando el puerto ${DEFAULT_PORT}`);
    return;
  }
  
  logInfo(`Procesos usando el puerto ${DEFAULT_PORT}: ${pids.join(', ')}`);
  
  if (options.kill || options.restart) {
    // Verificar si es nuestro backend
    try {
      const processInfo = execSync(`ps -p ${pids[0]} -o comm=`, { encoding: 'utf8' }).trim();
      logInfo(`Proceso: ${processInfo}`);
      
      if (processInfo.includes('node')) {
        logInfo('Proceso Node.js detectado. Matando...');
        killProcesses(pids);
        
        // Esperar un momento
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (options.restart) {
          logInfo(`Iniciando backend en el puerto ${DEFAULT_PORT}...`);
          startBackend(DEFAULT_PORT);
        } else {
          logSuccess('Puerto liberado. Puedes iniciar el backend manualmente.');
        }
      } else {
        logError(`El proceso no es Node.js: ${processInfo}`);
        logError('No se matará automáticamente. Usa: kill -9 ' + pids.join(' '));
      }
    } catch (err) {
      logError(`Error al obtener información del proceso: ${err.message}`);
    }
  } else {
    logInfo('');
    logInfo('Opciones:');
    logInfo(`  Para matar los procesos: node scripts/fixPort.js --kill`);
    logInfo(`  Para matar y reiniciar: node scripts/fixPort.js --restart`);
    logInfo(`  Para usar otro puerto: node scripts/fixPort.js --port 3001 --restart`);
    logInfo('');
    logInfo(`  O manualmente: kill -9 ${pids.join(' ')}`);
  }
}

main().catch(err => {
  logError(`Error: ${err.message}`);
  process.exit(1);
});
