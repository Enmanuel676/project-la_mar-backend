const router = require('express').Router();
const auth = require('../middlewares/auth');
const attachUser = require('../middlewares/attachUser');
const upload = require('../middlewares/upload');
const {
  validateArticle,
  validateArticleId,
  validateArticleUpdate,
} = require('../middlewares/validation');
const {
  getArticles,
  getDeletedArticles,
  createArticle,
  updateArticle,
  deleteArticle,
  restoreArticle,
  destroyArticle,
} = require('../controllers/articles');

// Todo lo de este archivo es del panel de administración.
// attachUser carga el usuario completo para que los controladores sepan si es admin.
router.use(auth);
router.use(attachUser);

router.get('/', getArticles);
router.get('/deleted', getDeletedArticles);
// upload va antes que la validación: multer es quien rellena req.body en peticiones multipart.
router.post('/', upload, validateArticle, createArticle);
router.put('/:id', upload, validateArticleUpdate, updateArticle);
router.delete('/:id', validateArticleId, deleteArticle);
router.post('/:id/restore', validateArticleId, restoreArticle);
router.delete('/:id/permanent', validateArticleId, destroyArticle);

module.exports = router;
