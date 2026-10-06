const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const routes = require('./routes');
const ApiError = require('./utils/ApiError');
const requestLogger = require('./middlewares/requestLogger');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Sin esto cada respuesta dice "X-Powered-By: Express", una pista gratuita para quien
// busque fallos conocidos de esa versión.
app.disable('x-powered-by');

app.use(requestLogger);
app.use(express.json());

// CORS del panel: solo los orígenes de ALLOWED_ORIGINS. Va aquí y no dentro de cada ruta
// para que sea fácil ver qué queda abierto y qué no. /api/public no aparece en esta lista
// porque tiene su propio CORS abierto (ver routes/public.js).
app.use(['/api/auth', '/api/articles'], cors({
  origin: env.allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use('/api', routes);

// Si ninguna ruta respondió, la dirección no existe.
app.use((req, res, next) => {
  next(new ApiError(404, 'Recurso no encontrado.'));
});

// Siempre el último: recoge los errores de todo lo anterior.
app.use(errorHandler);

module.exports = app;
