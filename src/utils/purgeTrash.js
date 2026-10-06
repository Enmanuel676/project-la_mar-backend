const env = require('../config/env');
const logger = require('../config/logger');
const Article = require('../models/article');
const { deleteImage } = require('./imageStorage');

const DAY_MS = 24 * 60 * 60 * 1000;

// Borra para siempre los artículos que llevan más de TRASH_RETENTION_DAYS en la papelera,
// con su imagen del bucket. Lo hace el servidor y no un índice TTL de Mongo porque el TTL
// solo borraría el documento, y la foto se quedaría en el bucket sin dueño.
async function purgeTrash() {
  try {
    const limit = new Date(Date.now() - env.trashRetentionDays * DAY_MS);
    const expired = await Article.find({ deletedAt: { $ne: null, $lt: limit } });

    // Uno por uno: si una imagen falla, los demás artículos se purgan igual.
    // eslint-disable-next-line no-restricted-syntax
    for (const article of expired) {
      try {
        // Primero la imagen y luego el documento: si el bucket falla, el artículo se
        // queda en la papelera y se reintenta mañana. Al revés, la foto quedaría huérfana.
        // eslint-disable-next-line no-await-in-loop
        await deleteImage(article.imagePath);
        // eslint-disable-next-line no-await-in-loop
        await article.deleteOne();
        logger.info(`Papelera: artículo ${article.id} eliminado definitivamente`);
      } catch (err) {
        logger.error(`Papelera: no se pudo purgar ${article.id}: ${err.message}`);
      }
    }
  } catch (err) {
    // Este trabajo corre solo y nadie lo ve: un fallo aquí nunca debe tumbar el servidor.
    logger.error(`Papelera: falló la purga: ${err.message}`);
  }
}

// Una vez al arrancar (por si el servidor estuvo apagado varios días) y después cada 24 h.
function schedulePurge() {
  purgeTrash();
  setInterval(purgeTrash, DAY_MS);
}

module.exports = { purgeTrash, schedulePurge };
