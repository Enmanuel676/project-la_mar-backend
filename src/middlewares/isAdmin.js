const User = require('../models/user');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

// Middleware que verifica si el usuario autenticado es administrador.
// Se usa después del middleware `auth` (que pone req.user con el _id).
// Un usuario es admin si su correo está en la lista ADMIN_EMAILS o tiene role='admin'.
module.exports = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return next(new ApiError(401, 'Usuario no encontrado.'));
    }

    if (!user.isAdmin()) {
      logger.warn(`Intento de acceso a ruta de admin por usuario no autorizado: ${user.email}`, {
        userId: user._id,
        email: user.email,
        path: req.originalUrl,
        ip: req.ip,
      });
      return next(new ApiError(403, 'No tienes permisos para realizar esta acción.'));
    }

    // Guardar el usuario completo en req para usarlo en los controladores
    req.adminUser = user;
    return next();
  } catch (err) {
    return next(err);
  }
};
