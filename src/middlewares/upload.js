const multer = require('multer');
const ApiError = require('../utils/ApiError');

// Solo formatos de foto (GIF incluido, por las animaciones). SVG queda fuera a propósito,
// porque puede llevar scripts y el bucket es público. Todas se guardan después como WebP
// (ver utils/optimizeImage.js). El panel tiene la misma lista en lib/api.js.
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Lo que se admite al recibir la foto, no lo que se guarda: antes de subirla al bucket se
// reduce y se comprime. El panel envía la foto original, y con 20 MB cabe la de casi
// cualquier móvil sin que una subida enorme se coma la memoria del servidor.
const MAX_MB = 20;

// En memoria y no en disco: la foto solo pasa por el servidor de camino al bucket.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    if (ACCEPTED_TYPES.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new ApiError(400, 'La imagen debe ser JPG, PNG, WebP o GIF.'));
  },
});

const singleImage = upload.single('image');

// El tipo MIME lo declara el cliente y puede mentir. Los primeros bytes de un archivo
// dicen qué es de verdad, así que se comprueban también.
function hasValidSignature(buffer) {
  const isJpeg = buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const isPng = buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const isWebp = buffer.subarray(0, 4).toString('latin1') === 'RIFF'
    && buffer.subarray(8, 12).toString('latin1') === 'WEBP';
  const isGif = ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('latin1'));
  return isJpeg || isPng || isWebp || isGif;
}

// Traduce los errores de multer a mensajes en español, con el código HTTP correcto.
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const text = err.code === 'LIMIT_FILE_SIZE'
      ? `La imagen no puede pesar más de ${MAX_MB} MB.`
      : 'Solo se puede subir una imagen, en el campo "image".';
    next(new ApiError(400, text));
    return;
  }
  next(err);
}

function checkSignature(req, res, next) {
  // La imagen es opcional: al editar un artículo puede no venir ninguna.
  if (req.file && !hasValidSignature(req.file.buffer)) {
    next(new ApiError(400, 'El archivo no es una imagen válida.'));
    return;
  }
  next();
}

// Express acepta un arreglo de middlewares. Va antes de celebrate, porque multer es quien
// rellena req.body cuando la petición es multipart.
module.exports = [singleImage, handleUploadError, checkSignature];
