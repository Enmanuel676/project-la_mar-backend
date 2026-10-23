const User = require('../models/user');

// Middleware que adjunta el usuario completo a req (como req.fullUser) si está autenticado.
// A diferencia de isAdmin, no bloquea el paso: sirve para que los controladores sepan
// si el usuario es admin sin impedir el acceso a usuarios normales.
module.exports = async (req, res, next) => {
  try {
    if (req.user && req.user._id) {
      const user = await User.findById(req.user._id);
      if (user) {
        req.fullUser = user;
        // Si es admin, también lo ponemos en req.adminUser para que getOwnerFilter funcione
        if (user.isAdmin()) {
          req.adminUser = user;
        }
      }
    }
    next();
  } catch (err) {
    // Si falla la carga del usuario, seguimos adelante: el controlador decidirá
    next();
  }
};
