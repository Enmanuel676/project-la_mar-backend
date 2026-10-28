const mongoose = require('mongoose');
const logger = require('../src/config/logger');
const { connectDb } = require('../src/config/db');
const User = require('../src/models/user');
const Article = require('../src/models/article');
const { deleteImage } = require('../src/utils/imageStorage');

// Email del administrador a conservar
const ADMIN_EMAIL_TO_KEEP = 'daralibatista@gmail.com';

async function cleanup() {
  await connectDb();

  // 1. Eliminar todas las publicaciones
  logger.info('Borrando todas las publicaciones...');

  // Primero eliminar imagenes de todas las publicaciones
  const articles = await Article.find({});
  const deletePromises = articles.map(async (article) => {
    if (article.imagePath) {
      try {
        await deleteImage(article.imagePath);
        logger.info(`Imagen borrada: ${article.imagePath}`);
      } catch (err) {
        logger.error(`No se pudo borrar la imagen ${article.imagePath}: ${err.message}`);
      }
    }
  });
  await Promise.all(deletePromises);

  // Eliminar todos los artículos de la base de datos,
  await Article.deleteMany({});
  logger.info(`Eliminados ${articles.length} artículos de la base de datos`);

  // 2. Eliminar usuarios excepto el administrador especificado
  logger.info('Limpando usuarios...');

  // Encontrar el usuario a conservar
  const adminUser = await User.findOne({ email: ADMIN_EMAIL_TO_KEEP });

  if (adminUser) {
    logger.info(`Conservando usuario administrador: ${ADMIN_EMAIL_TO_KEEP}`);
    // Eliminar todos los usuarios excepto el administrador
    const result = await User.deleteMany({
      email: { $ne: ADMIN_EMAIL_TO_KEEP },
    });
    logger.info(`Eliminados ${result.deletedCount} usuarios. Conservado: ${adminUser.email}`);
  } else {
    logger.warn(`No se encontró el usuario ${ADMIN_EMAIL_TO_KEEP}, se eliminarán TODOS los usuarios`);
    await User.deleteMany({});
    logger.info('Todos los usuarios han sido eliminados');
  }

  logger.info('Limpieza completada');
}

cleanup()
  .catch((err) => {
    logger.error(`Error durante la limpieza: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    logger.logger.on('finish', () => process.exit());
    logger.logger.end();
  });
