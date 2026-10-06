const router = require('express').Router();
const cors = require('cors');
const { getPublicArticles } = require('../controllers/public');

// Cualquier origen puede leer el catálogo, pero solo leer: el sitio público puede estar
// en un dominio, en localhost o en GitHub Pages. Es lo contrario de las rutas del panel,
// que solo aceptan los orígenes de ALLOWED_ORIGINS (se configura en app.js).
router.use(cors({ origin: '*', methods: ['GET'] }));

router.get('/articles', getPublicArticles);

module.exports = router;
