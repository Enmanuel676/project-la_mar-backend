const router = require('express').Router();

// GET /api - Documentación de los endpoints
router.get('/', (req, res) => {
  const apiRoutes = {
    name: 'La Mar API',
    version: '1.0',
    description: 'API de la joyería La Mar. Las rutas marcadas con [Auth] requieren token de autenticación.',
    baseUrl: '/api',
    endpoints: {
      auth: {
        'POST /api/auth/login': 'Iniciar sesión - { email, password } → { token, user }',
        'POST /api/auth/register': 'Registrar usuario - { firstName, lastName, email, password } → { token, user }',
        'POST /api/signup': 'Alias de /auth/register (Requisito Etapa 2)',
        'POST /api/auth/logout': 'Cerrar sesión (borra cookie)',
        'GET /api/users/me [Auth]': 'Datos del usuario autenticado (sin contraseña)',
      },
      articles: {
        'GET /api/articles [Auth]': 'Listar artículos activos (admin: todos, user: propios)',
        'POST /api/articles [Auth]': 'Crear artículo (asigna ownerId automáticamente)',
        'PUT /api/articles/:id [Auth]': 'Editar artículo',
        'DELETE /api/articles/:id [Auth]': 'Mover a papelera',
        'GET /api/articles/deleted [Auth]': 'Listar papelera',
        'POST /api/articles/:id/restore [Auth]': 'Restaurar de papelera',
        'DELETE /api/articles/:id/permanent [Auth]': 'Borrado definitivo',
        'GET /api/public/articles': 'Listar artículos publicados (público)',
      },
      users: {
        'GET /api/users [Auth, Admin]': 'Listar todos los usuarios',
        'GET /api/users/:id [Auth, Admin]': 'Obtener usuario por ID',
        'PUT /api/users/:id [Auth, Admin]': 'Editar usuario (name, email, role)',
        'DELETE /api/users/:id [Auth, Admin]': 'Eliminar usuario (y sus publicaciones)',
        'POST /api/users/:id/change-password [Auth, Admin]': 'Cambiar contraseña',
      },
    },
    notes: [
      'Las rutas de autenticación guardan el token en una cookie HttpOnly (lamar_token).',
      'Puedes acceder directamente desde el navegador a cualquier ruta con session activa.',
      'Ejemplos: /api/users/me, /api/articles, /api/users',
      'Los errores siempre devuelven { "message": "descripción" } en español.',
    ],
  };
  res.json(apiRoutes);
});

module.exports = router;
