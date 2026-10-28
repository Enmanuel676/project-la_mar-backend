// Script de terminal: el informe se lee en pantalla con console.log, también en producción,
// donde el logger no escribe en la consola (.eslintrc permite console en scripts/).
const mongoose = require('mongoose');
const { connectDb } = require('../src/config/db');
const { getBucket } = require('../src/config/storage');
const Article = require('../src/models/article');
const { optimizeImage } = require('../src/utils/optimizeImage');
const { uploadImage, deleteImage } = require('../src/utils/imageStorage');

// Pasa por optimizeImage las fotos que ya están en el bucket: las subidas antes de que
// existiera, o con otras reglas (por ejemplo, si se cambia MAX_SIDE). Las que ya cumplen las
// reglas se quedan como están. Con --dry-run solo informa, sin subir, cambiar ni borrar nada.
const DRY_RUN = process.argv.includes('--dry-run');

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

async function optimizeArticle(article) {
  const oldPath = article.imagePath;
  const [original] = await getBucket().file(oldPath).download();
  const optimized = await optimizeImage(original);
  if (optimized === original) {
    return 'ya estaba optimizada';
  }
  const change = `${mb(original.length)} → ${mb(optimized.length)}`;
  if (DRY_RUN) {
    return `se optimizaría (${change})`;
  }

  // uploadImage la vuelve a pasar por optimizeImage, pero como ya está lista se sube tal cual.
  const uploaded = await uploadImage({ buffer: optimized });
  // Solo si la foto sigue siendo la misma: si alguien la cambió desde el panel mientras tanto,
  // gana su cambio. timestamps: false, para que esto no cuente como una edición del artículo.
  const { modifiedCount } = await Article.updateOne(
    { _id: article._id, imagePath: oldPath },
    { image: uploaded.url, imagePath: uploaded.path },
    { timestamps: false },
  ).catch(async (err) => {
    await deleteImage(uploaded.path);
    throw err;
  });
  if (!modifiedCount) {
    await deleteImage(uploaded.path);
    return 'la foto cambió mientras tanto; no se tocó';
  }

  // La foto vieja se borra al final: si algo falla antes, el artículo sigue con la suya.
  try {
    await deleteImage(oldPath);
  } catch (err) {
    return `optimizada (${change}), pero la anterior no se pudo borrar: ${oldPath}`;
  }
  return `optimizada (${change})`;
}

async function optimizeImages() {
  await connectDb();
  // También las de la papelera: se pueden restaurar.
  const articles = await Article.find({ imagePath: { $nin: ['', null] } });
  console.log(`${articles.length} artículo(s) con foto en el bucket${DRY_RUN ? ' (simulación: no se cambia nada)' : ''}.`);

  // De uno en uno (cadena de promesas): si una foto falla, las demás se procesan igual.
  await articles.reduce((chain, article) => chain.then(async () => {
    try {
      console.log(`- ${article.name} (${article.id}): ${await optimizeArticle(article)}`);
    } catch (err) {
      const reason = err.code === 404 ? 'la foto no está en el bucket' : err.message;
      console.log(`- ${article.name} (${article.id}): ERROR, ${reason}`);
      process.exitCode = 1;
    }
  }), Promise.resolve());

  // Fotos con URL de fuera del bucket (de antes de que el panel subiera archivos): no se pueden
  // descargar ni borrar desde aquí.
  const external = await Article.countDocuments({
    image: { $nin: ['', null] },
    imagePath: { $in: ['', null] },
  });
  if (external) {
    console.log(`${external} artículo(s) con una foto fuera del bucket (URL externa): no se tocan.`);
  }
}

optimizeImages()
  .catch((err) => {
    console.error(`No se pudo completar la optimización: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
