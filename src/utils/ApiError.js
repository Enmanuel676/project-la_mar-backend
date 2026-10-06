// Un solo tipo de error con código HTTP. El manejador central (paso 9) lee `statusCode`
// para responder; cualquier otro error se trata como un 500.
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = ApiError;
