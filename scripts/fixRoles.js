const mongoose = require('mongoose');
const logger = require('../src/config/logger');
const connectDb = require('../src/config/db');
const User = require('../src/models/user');

function log(msg) {
  logger.info(msg);
  console.log(msg);
}

// Corrige roles de usuarios que el frontend considera admin pero en la BD son 'user'.
// El frontend (Dashboard.jsx) tiene una lista hardcodeada de correos admin.
const ADMIN_EMAILS = [
  'darelisbatistag@gmail.com',
  'enmanuel676hd@gmail.com',
  'admin@lamar.com',
];

async function fixRoles() {
  await connectDb();

  let fixed = 0;
  for (const email of ADMIN_EMAILS) {
    const result = await User.updateOne(
      { email: email.toLowerCase().trim() },
      { $set: { role: 'admin' } },
    );
    if (result.modifiedCount > 0) {
      log(`Corregido: ${email} → role: admin`);
      fixed++;
    } else if (result.matchedCount > 0) {
      log(`Ya es admin: ${email}`);
    } else {
      log(`No existe: ${email}`);
    }
  }

  // Mostrar estado final.
  const all = await User.find().sort({ createdAt: 1 });
  log(`\nUsuarios finales (${all.length}):`);
  for (const u of all) {
    log(`  - ${u.email} | name: "${u.name}" | role: ${u.role} | isAdmin: ${u.role === 'admin'}`);
  }

  log(`\n${fixed} usuario(s) corregido(s).`);
}

fixRoles()
  .catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
