const Article = require('../models/article');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { uploadImage, deleteImage } = require('../utils/imageStorage');

// `deletedAt: null` también coincide con los documentos que no tienen el campo, que son
// todos los artículos activos.
const ACTIVE = { deletedAt: null };

// Se eligen los campos uno a uno, en vez de pasar req.body entero al modelo: así nadie
// puede colar campos internos (imagePath, deletedAt…) aunque se le escape algo a la
// validación. Además `collection` se guarda como `collectionName` (ver el modelo).
// Los campos que no llegaron se descartan: en una edición parcial, `undefined` borraría
// el valor que ya estaba guardado.
function pickFields(body) {
  const fields = {
    name: body.name,
    price: body.price,
    currency: body.currency,
    // Un stock vacío significa "sin límite", que se guarda como null.
    stock: body.stock === '' ? null : body.stock,
    category: body.category,
    collectionName: body.collection,
    materials: body.materials,
    description: body.description,
    published: body.published,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

// Borrar una imagen vieja es "lo mejor posible": si falla, el artículo ya está guardado y
// es mejor dejar una foto huérfana en el bucket que devolver un error a quien editó.
async function tryDeleteImage(path) {
  try {
    await deleteImage(path);
  } catch (err) {
    logger.error(`No se pudo borrar la imagen ${path}: ${err.message}`);
  }
}

async function getArticles(req, res, next) {
  try {
    const articles = await Article.find(ACTIVE)
      .populate('owner', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.send(articles);
  } catch (err) {
    next(err);
  }
}

async function getDeletedArticles(req, res, next) {
  try {
    const articles = await Article.find({ deletedAt: { $ne: null } })
      .populate('owner', 'firstName lastName email')
      .sort({ deletedAt: -1 });
    res.send(articles);
  } catch (err) {
    next(err);
  }
}

async function createArticle(req, res, next) {
  let uploaded;
  try {
    const data = pickFields(req.body);
    // Asignar el usuario autenticado como owner del artículo.
    data.owner = req.user._id;
    if (req.file) {
      uploaded = await uploadImage(req.file);
      data.image = uploaded.url;
      data.imagePath = uploaded.path;
    }
    const article = await Article.create(data);
    res.status(201).send(article);
  } catch (err) {
    // Si la foto ya se subió pero el artículo no se pudo crear, se borra para no dejarla huérfana.
    if (uploaded) {
      await tryDeleteImage(uploaded.path);
    }
    next(err);
  }
}

async function updateArticle(req, res, next) {
  let uploaded;
  try {
    const article = await Article.findOne({ _id: req.params.id, ...ACTIVE });
    if (!article) {
      throw new ApiError(404, 'Artículo no encontrado.');
    }

    const oldPath = article.imagePath;
    article.set(pickFields(req.body));

    if (req.file) {
      uploaded = await uploadImage(req.file);
      article.image = uploaded.url;
      article.imagePath = uploaded.path;
    } else if (req.body.removeImage) {
      article.image = '';
      article.imagePath = '';
    }

    await article.save();

    // La foto anterior solo se borra cuando todo lo demás salió bien, y solo si cambió.
    if (oldPath && oldPath !== article.imagePath) {
      await tryDeleteImage(oldPath);
    }
    res.send(article);
  } catch (err) {
    if (uploaded) {
      await tryDeleteImage(uploaded.path);
    }
    next(err);
  }
}

// Borrado lógico: pasa a la papelera. Se despublica para que deje de salir en la web
// pública, y al restaurarlo vuelve como borrador.
async function deleteArticle(req, res, next) {
  try {
    const article = await Article.findOneAndUpdate(
      { _id: req.params.id, ...ACTIVE },
      { deletedAt: new Date(), published: false },
    );
    if (!article) {
      throw new ApiError(404, 'Artículo no encontrado.');
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function restoreArticle(req, res, next) {
  try {
    const article = await Article.findOneAndUpdate(
      { _id: req.params.id, deletedAt: { $ne: null } },
      { $unset: { deletedAt: 1 } },
      { new: true },
    );
    if (!article) {
      throw new ApiError(404, 'Artículo no encontrado en la papelera.');
    }
    res.send(article);
  } catch (err) {
    next(err);
  }
}

// Borrado definitivo. Solo vale para artículos que ya están en la papelera: un artículo
// activo no se puede destruir de un solo paso, así que un clic equivocado tiene salvación.
async function destroyArticle(req, res, next) {
  try {
    const article = await Article.findOne({ _id: req.params.id, deletedAt: { $ne: null } });
    if (!article) {
      throw new ApiError(404, 'Artículo no encontrado en la papelera.');
    }
    // Primero la imagen y después el documento: si el bucket falla, el artículo sigue en la
    // papelera y se puede reintentar. Al revés, la foto quedaría sin dueño para siempre.
    await deleteImage(article.imagePath);
    await article.deleteOne();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getArticles,
  getDeletedArticles,
  createArticle,
  updateArticle,
  deleteArticle,
  restoreArticle,
  destroyArticle,
};
