const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const env = require('../config/env');
const logger = require('../config/logger');
const User = require('../models/user');
const ApiError = require('../utils/ApiError');
const { SESSION_COOKIE, sessionCookieOptions, setSessionCookie } = require('../utils/sessionCookie');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findByCredentials(email, password);
    if (!user) {
      // Registrar intento de login fallido
      logger.warn(`Intento de login fallido: ${email}`, {
        email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      throw new ApiError(401, 'Correo o contraseña incorrectos.');
    }

    // Registrar login exitoso
    logger.info(`Login exitoso: ${email}`, {
      email: user.email,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // En el token solo va el id: lo demás se puede consultar, y así no queda desfasado
    // si cambia el nombre o el correo.
    const token = jwt.sign({ _id: user._id }, env.jwtSecret, { algorithm: 'HS256', expiresIn: env.jwtExpiresIn });
    // Además del cuerpo, el token viaja en una cookie: así entrar a la API directamente
    // (escribir la URL en el navegador) funciona sin pegar cabeceras.
    setSessionCookie(req, res, token);
    // El panel espera { token, user } y guarda `user` para mostrar el nombre.
    // Se incluye el rol para que el frontend sepa si puede gestionar usuarios.
    res.send({
      token,
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
        isAdmin: user.isAdmin(),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function register(req, res, next) {
  try {
    const {
      firstName, lastName, email, password,
    } = req.body;

    // Comprobar si el correo ya está registrado
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      // Registrar intento de registro con correo duplicado
      logger.warn(`Intento de registro fallido: correo ya existe ${email}`, {
        email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      throw new ApiError(409, 'Ya existe una cuenta con este correo electrónico.');
    }

    // Crear el nombre completo a partir del nombre y apellido
    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    // Hashear la contraseña
    const hash = await bcrypt.hash(password, 10);

    // Crear el usuario
    const user = await User.create({
      email: email.toLowerCase().trim(),
      name: fullName,
      password: hash,
    });

    // Registrar registro exitoso
    logger.info(`Registro exitoso: ${email}`, {
      email: user.email,
      name: fullName,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Determinar el rol: si el correo está en la lista de admins, se asigna 'admin'
    const isAdminUser = User.isAdminEmail(user.email);
    if (isAdminUser && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }

    // Generar token y devolver la sesión (igual que el login)
    const token = jwt.sign({ _id: user._id }, env.jwtSecret, { algorithm: 'HS256', expiresIn: env.jwtExpiresIn });
    setSessionCookie(req, res, token);
    res.status(201).send({
      token,
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
        isAdmin: user.isAdmin(),
      },
    });
  } catch (err) {
    // Registrar errores inesperados durante el registro
    logger.error(`Error durante el registro: ${err.message}`, {
      error: err.message,
      stack: err.stack,
      body: req.body ? { ...req.body, password: '***' } : undefined,
      ip: req.ip,
    });
    next(err);
  }
}

// Cierre de sesión: borra la cookie del navegador. No usa el middleware auth a propósito:
// hay que poder cerrar sesión aunque el token ya haya caducado. El token en sí es stateless
// (JWT), así que "cerrar sesión" aquí es solo olvidar la cookie; el panel borra además su
// copia en localStorage.
async function logout(req, res) {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions(req));
  res.status(204).send();
}

module.exports = { login, register, logout };
