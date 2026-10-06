const Article = require('../models/article');

// Solo lo que pinta la web pública. `select` es una lista blanca: lo que no se nombra aquí
// (published, deletedAt, updatedAt, imagePath) nunca sale de la base de datos hacia fuera,
// aunque más adelante se añadan campos internos al modelo.
const PUBLIC_FIELDS = 'name price currency stock category collectionName materials description image createdAt';

async function getPublicArticles(req, res, next) {
  try {
    // Publicado y fuera de la papelera. Eliminar un artículo ya lo despublica, pero se
    // comprueban las dos cosas: si una falla, la otra sigue protegiendo.
    const articles = await Article
      .find({ published: true, deletedAt: null })
      .select(PUBLIC_FIELDS)
      .sort({ createdAt: -1 });

    // `no-cache` no impide guardar la respuesta: obliga a preguntar al servidor antes de
    // reutilizarla (con el ETag, si nada cambió responde 304 sin cuerpo). Así un artículo
    // recién publicado desde el panel aparece en el catálogo al instante, sin esperar a que
    // caduque una copia guardada en el navegador o en un proxy.
    res.set('Cache-Control', 'no-cache');
    res.send(articles);
  } catch (err) {
    next(err);
  }
}

module.exports = { getPublicArticles };
