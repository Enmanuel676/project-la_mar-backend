const User = require('../models/user');
const ApiError = require('../utils/ApiError');

// El frontend envía `name` como un solo campo (nombre completo). El modelo guarda
// firstName y lastName separados. Se divide por el primer espacio: "Dara Libatista"
// → firstName: "Dara", lastName: "Libatista".
function splitName(fullName) {
  const trimmed = (fullName || '').trim();
  const idx = trimmed.indexOf(' ');
  if (idx === -1) {
    return { firstName: trimmed, lastName: '' };
  }
  return {
    firstName: trimmed.slice(0, idx),
    lastName: trimmed.slice(idx + 1).trim(),
  };
}

// Convierte un documento de usuario al formato que espera el frontend.
function toUserResponse(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    isAdmin: user.role === 'admin',
    createdAt: user.createdAt,
  };
}

// Listar todos los usuarios (solo admin).
async function listUsers(req, res, next) {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.send(users.map(toUserResponse));
  } catch (err) {
    next(err);
  }
}

// Obtener un usuario por id (solo admin).
async function getUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      throw new ApiError(404, 'Usuario no encontrado.');
    }
    res.send(toUserResponse(user));
  } catch (err) {
    next(err);
  }
}

// Actualizar un usuario (solo admin). Acepta name (completo), email y role.
async function updateUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      throw new ApiError(404, 'Usuario no encontrado.');
    }

    const { name, email, role } = req.body;

    if (name !== undefined) {
      const { firstName, lastName } = splitName(name);
      user.firstName = firstName;
      user.lastName = lastName;
    }
    if (email !== undefined) {
      // Verificar que el nuevo correo no esté en uso por otro usuario.
      const existing = await User.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: user._id },
      });
      if (existing) {
        throw new ApiError(409, 'Ya existe una cuenta con ese correo electrónico.');
      }
      user.email = email;
    }
    if (role !== undefined) {
      user.role = role;
    }

    await user.save();
    res.send(toUserResponse(user));
  } catch (err) {
    next(err);
  }
}

// Eliminar un usuario (solo admin). No se puede eliminar a sí mismo.
async function deleteUser(req, res, next) {
  try {
    // No permitir que un admin se elimine a sí mismo.
    if (req.params.id === req.user._id.toString()) {
      throw new ApiError(400, 'No puedes eliminar tu propia cuenta.');
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      throw new ApiError(404, 'Usuario no encontrado.');
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// Cambiar la contraseña de un usuario (solo admin).
async function changeUserPassword(req, res, next) {
  try {
    const user = await User.findById(req.params.id).select('+password');
    if (!user) {
      throw new ApiError(404, 'Usuario no encontrado.');
    }
    await user.setPassword(req.body.password);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listUsers,
  getUser,
  updateUser,
  deleteUser,
  changeUserPassword,
};
