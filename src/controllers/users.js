const bcrypt = require('bcrypt');
const User = require('../models/user');
const Article = require('../models/article');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { deleteImage } = require('../utils/imageStorage');

// Listar todos los usuarios (sin contraseñas).
async function getUsers(req, res, next) {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    // Aplicar toJSON a cada usuario para incluir el campo calculado isAdmin
    const usersJSON = users.map((user) => user.toJSON());
    res.send(usersJSON);
  } catch (err) {
    next(err);
  }
}

// Obtener un usuario por ID (sin contraseña).
async function getUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      throw new ApiError(404, 'Usuario no encontrado.');
    }
    // Asegurar que isAdmin está incluido en la respuesta
    const userJSON = user.toJSON();
    res.send(userJSON);
  } catch (err) {
    next(err);
  }
}

// Actualizar un usuario (nombre, correo, rol). No se permite cambiar la contraseña desde aquí.
async function updateUser(req, res, next) {
  try {
    const { name, email, role } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      throw new ApiError(404, 'Usuario no encontrado.');
    }

    // No permitir que un admin se quite a sí mismo los permisos de admin
    if (user._id.toString() === req.adminUser._id.toString() && role === 'user') {
      throw new ApiError(400, 'No puedes quitarte los permisos de administrador a ti mismo.');
    }

    // Si se cambia el correo, verificar que no esté en uso
    if (email && email.toLowerCase().trim() !== user.email) {
      const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
      if (existingUser) {
        throw new ApiError(409, 'Ya existe una cuenta con este correo electrónico.');
      }
      user.email = email.toLowerCase().trim();
      // Si el nuevo correo está en la lista de admins, actualizar el rol
      if (User.isAdminEmail(user.email)) {
        user.role = 'admin';
      }
    }

    if (name) user.name = name.trim();
    if (role && ['admin', 'user'].includes(role)) {
      user.role = role;
    }

    await user.save();

    logger.info(`Usuario actualizado: ${user.email} por ${req.adminUser.email}`, {
      updatedUserId: user._id,
      updatedEmail: user.email,
      adminEmail: req.adminUser.email,
    });

    // Devolver sin contraseña y con isAdmin actualizado
    res.send(user.toJSON());
  } catch (err) {
    next(err);
  }
}

// Eliminar un usuario.
async function deleteUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      throw new ApiError(404, 'Usuario no encontrado.');
    }

    // No permitir que un admin se elimine a sí mismo
    if (user._id.toString() === req.adminUser._id.toString()) {
      throw new ApiError(400, 'No puedes eliminar tu propia cuenta.');
    }

    // Borrar todas sus publicaciones —activas, borradores y en la papelera— para que no
    // queden sueltas sin dueño. Las fotos se borran del bucket una a una, como al borrar
    // un artículo: si falla una, se registra y se sigue, para no dejar la cuenta a medias.
    const articles = await Article.find({ ownerId: user._id });
    await Promise.all(
      articles.map(async (article) => {
        if (!article.imagePath) return;
        try {
          await deleteImage(article.imagePath);
        } catch (err) {
          logger.error(
            `No se pudo borrar la imagen ${article.imagePath} al eliminar al usuario ${user.email}: ${err.message}`,
          );
        }
      }),
    );
    const removedArticles = await Article.deleteMany({ ownerId: user._id });

    await user.deleteOne();

    logger.info(`Usuario eliminado: ${user.email} por ${req.adminUser.email}`, {
      deletedUserId: user._id,
      deletedEmail: user.email,
      adminEmail: req.adminUser.email,
      removedArticles: removedArticles.deletedCount,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// Cambiar la contraseña de un usuario (solo admin).
async function changePassword(req, res, next) {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      throw new ApiError(400, 'La contraseña debe tener al menos 8 caracteres.');
    }

    const user = await User.findById(req.params.id).select('+password');
    if (!user) {
      throw new ApiError(404, 'Usuario no encontrado.');
    }

    const hash = await bcrypt.hash(password, 10);
    user.password = hash;
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    await user.save();

    logger.info(`Contraseña cambiada para: ${user.email} por ${req.adminUser.email}`, {
      userId: user._id,
      userEmail: user.email,
      adminEmail: req.adminUser.email,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// Datos del usuario autenticado (GET /users/me). La ruta solo requiere token, no ser admin:
// cualquiera puede consultar sus propios datos. Nunca devuelve la contraseña: el esquema la
// excluye de las consultas (select: false) y el toJSON la borra además del resultado.
async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      throw new ApiError(404, 'Usuario no encontrado.');
    }
    res.send(user.toJSON());
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getUsers,
  getUser,
  getMe,
  updateUser,
  deleteUser,
  changePassword,
};
