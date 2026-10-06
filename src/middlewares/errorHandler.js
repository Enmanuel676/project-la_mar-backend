const { isCelebrateError } = require('celebrate');
const logger = require('../config/logger');

// Traduce cualquier error a { statusCode, message }. Los errores conocidos se explican a
// la persona usuaria; los desconocidos se ocultan tras un mensaje genérico, porque el texto
// interno de un fallo (una consulta, una ruta de archivo) no debe salir del servidor.
function translate(err) {
  // Errores de validación de celebrate: se devuelve el primer mensaje, que es el que lee el panel.
  if (isCelebrateError(err)) {
    const [segment] = err.details.keys();
    return { statusCode: 400, message: err.details.get(segment).details[0].message };
  }
  // JSON mal formado en el cuerpo de la petición.
  if (err.type === 'entity.parse.failed') {
    return { statusCode: 400, message: 'El cuerpo de la petición no es un JSON válido.' };
  }
  // Errores propios (ApiError): su mensaje ya está escrito para la persona usuaria.
  if (err.statusCode && err.statusCode < 500) {
    return { statusCode: err.statusCode, message: err.message };
  }
  // Mongoose rechazó un dato (por ejemplo, un correo con formato incorrecto).
  if (err.name === 'ValidationError') {
    return { statusCode: 400, message: Object.values(err.errors)[0].message };
  }
  if (err.name === 'CastError') {
    return { statusCode: 400, message: 'El identificador no es válido.' };
  }
  // Código 11000 de Mongo: se intentó repetir un valor que debe ser único.
  if (err.code === 11000) {
    return { statusCode: 409, message: 'Ya existe un registro con esos datos.' };
  }
  // El 503 de "almacenamiento no configurado" sí es un mensaje pensado para mostrarse.
  if (err.statusCode === 503) {
    return { statusCode: 503, message: err.message };
  }
  return null;
}

// Express reconoce un manejador de errores por sus cuatro parámetros: hay que dejar `next`
// aunque no se use.
// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  const known = translate(err);

  if (known) {
    res.status(known.statusCode).send({ message: known.message });
    return;
  }

  // Error inesperado: queda en error.log con su traza, y fuera solo sale un mensaje genérico.
  logger.error(`${req.method} ${req.originalUrl} - ${err.stack || err.message}`);
  res.status(500).send({ message: 'Ha ocurrido un error en el servidor.' });
};
