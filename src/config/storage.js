const { Storage } = require('@google-cloud/storage');
const env = require('./env');
const ApiError = require('../utils/ApiError');

let storage;

// El cliente se crea la primera vez que se necesita, no al arrancar: así el servidor
// levanta aunque todavía no haya bucket configurado.
function getBucket() {
  if (!env.gcsBucketName) {
    throw new ApiError(503, 'El almacenamiento de imágenes no está configurado.');
  }
  if (!storage) {
    storage = new Storage({ projectId: env.gcsProjectId });
  }
  return storage.bucket(env.gcsBucketName);
}

module.exports = { getBucket };
