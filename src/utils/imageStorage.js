const crypto = require('crypto');
const env = require('../config/env');
const { getBucket } = require('../config/storage');
const { optimizeImage } = require('./optimizeImage');

// Sube la foto y devuelve la URL pública (`url`, la que pintan los frontends) y la ruta
// dentro del bucket (`path`, la que hace falta para borrarla después). Siempre se guarda
// como WebP de 5 MB o menos (ver optimizeImage).
async function uploadImage(file) {
  // El bucket se pide antes de convertir la foto: si no está configurado, el error llega
  // enseguida en vez de después de procesarla para nada.
  const bucket = getBucket();
  const image = await optimizeImage(file.buffer);
  // Nombre aleatorio y nunca el original: evita choques entre archivos y que alguien
  // escriba rutas raras con el nombre del archivo.
  const path = `articles/${crypto.randomUUID()}.webp`;
  await bucket.file(path).save(image, {
    resumable: false, // para archivos pequeños es una sola petición en vez de varias
    contentType: 'image/webp',
    // Como el nombre es único, el archivo nunca cambia: el navegador puede guardarlo un año.
    metadata: { cacheControl: 'public, max-age=31536000' },
  });
  return { url: `https://storage.googleapis.com/${env.gcsBucketName}/${path}`, path };
}

// ignoreNotFound: si el archivo ya no está (borrado a mano), no es un error.
async function deleteImage(path) {
  if (!path) {
    return;
  }
  await getBucket().file(path).delete({ ignoreNotFound: true });
}

module.exports = { uploadImage, deleteImage };
