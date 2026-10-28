const User = require('../models/user');
const ApiError = require('../utils/ApiError');

// Un JWT no basta si la cuenta se eliminó o no puede consultarse.
module.exports = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) return next(new ApiError(401, 'Se requiere iniciar sesión.'));
    const user = await User.findById(req.user._id);
    if (!user) return next(new ApiError(401, 'La cuenta ya no existe. Inicia sesión de nuevo.'));
    if ((req.user.sessionVersion || 0) !== (user.sessionVersion || 0)) {
      return next(new ApiError(401, 'La contraseña ha cambiado. Inicia sesión de nuevo.'));
    }
    req.fullUser = user;
    if (user.isAdmin()) req.adminUser = user;
    return next();
  } catch (err) {
    return next(err);
  }
};
