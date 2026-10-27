const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/user');
const ApiError = require('../utils/ApiError');
const { setSessionCookie, clearSessionCookie } = require('../utils/sessionCookie');

// Genera el token JWT y el objeto user que espera el frontend.
function buildAuthResponse(user) {
  // En el token solo va el id: lo demás se puede consultar, y así no queda desfasado
  // si cambia el nombre o el correo.
  const token = jwt.sign({ _id: user._id }, env.jwtSecret, { algorithm: 'HS256', expiresIn: env.jwtExpiresIn });
  // El panel espera { token, user } y guarda `user` para mostrar el nombre y el rol.
  return {
    token,
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isAdmin: user.role === 'admin',
      createdAt: user.createdAt,
    },
  };
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findByCredentials(email, password);
    if (!user) {
      throw new ApiError(401, 'Correo o contraseña incorrectos.');
    }
    // Además del token en el JSON (el panel lo guarda en localStorage), se fija la
    // cookie de sesión: es la que hace válida la sesión al entrar directo a la API
    // o desde otro subdominio.
    const payload = buildAuthResponse(user);
    setSessionCookie(res, payload.token);
    res.send(payload);
  } catch (err) {
    next(err);
  }
}

async function register(req, res, next) {
  try {
    const { firstName, lastName, email, password } = req.body;

    // Comprobar que el correo no esté ya registrado.
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      throw new ApiError(409, 'Ya existe una cuenta con ese correo electrónico.');
    }

    // El primer usuario registrado es admin; los demás son usuarios normales.
    const count = await User.countDocuments();
    const role = count === 0 ? 'admin' : 'user';

    const user = await User.createWithPassword({
      firstName,
      lastName,
      email,
      password,
      role,
    });

    const payload = buildAuthResponse(user);
    setSessionCookie(res, payload.token);
    res.status(201).send(payload);
  } catch (err) {
    next(err);
  }
}

// Devuelve los datos del usuario autenticado. El frontend lo usa para sincronizar
// la sesión (por ejemplo, si un admin cambió su rol).
async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      throw new ApiError(404, 'Usuario no encontrado.');
    }
    res.send({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isAdmin: user.role === 'admin',
      createdAt: user.createdAt,
    });
  } catch (err) {
    next(err);
  }
}

// Cierre de sesión. El servidor no guarda estado de sesión (el JWT vale hasta que
// caduca), pero sí hay que borrar la cookie del navegador: si no, seguiría llegando
// sola en las peticiones y la sesión parecería viva. El cliente descarta además el
// token de localStorage. Se responde 204 para que el frontend sepa que terminó.
async function logout(req, res, next) {
  try {
    clearSessionCookie(res);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { login, register, getMe, logout };
