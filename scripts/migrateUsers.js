const mongoose = require('mongoose');
const logger = require('../src/config/logger');
const connectDb = require('../src/config/db');
const User = require('../src/models/user');

// Doble salida: logger (archivos) + console.log (stdout del proceso).
function log(msg) {
  logger.info(msg);
  console.log(msg);
}

// Migra usuarios creados con el modelo antiguo (campo `name`) al nuevo formato
// (firstName, lastName, role). Los correos de ADMIN_EMAILS reciben role 'admin'.
async function migrate() {
  await connectDb();

  const results = await User.migrateLegacyUsers();

  if (results.length === 0) {
    log('No hay usuarios legacy que migrar.');
  } else {
    log(`Migrados ${results.length} usuario(s):`);
    for (const r of results) {
      log(`  - ${r.email} → ${r.firstName} ${r.lastName} (${r.role})`);
    }
  }

  // Mostrar estado final de todos los usuarios.
  const all = await User.find().sort({ createdAt: 1 });
  log(`\nUsuarios actuales (${all.length}):`);
  for (const u of all) {
    log(`  - ${u.email} | name: "${u.name}" | role: ${u.role} | isAdmin: ${u.role === 'admin'}`);
  }
}

migrate()
  .catch((err) => {
    logger.error(`Error en la migración: ${err.message}`);
    console.error(`Error en la migración: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
