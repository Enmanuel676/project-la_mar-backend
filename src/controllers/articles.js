const Article = require("../models/article");
const ApiError = require("../utils/ApiError");
const logger = require("../config/logger");
const { uploadImage, deleteImage } = require("../utils/imageStorage");

// `deletedAt: null` también coincide con los documentos que no tienen el campo, que son
// todos los artículos activos.
const ACTIVE = { deletedAt: null };

// Obtener el filtro base para los artículos del usuario actual.
// Los admins pueden ver todos los artículos; los usuarios normales solo los suyos.
function getOwnerFilter(req) {
  // Check si el usuario es admin: puede estar en req.adminUser (desde isAdmin middleware)
  // o en req.fullUser (desde attachUser)
  const user = req.adminUser || req.fullUser;

  // Si el usuario es admin, puede ver todos los artículos
  if (user && user.isAdmin && user.isAdmin()) {
    return {};
  }
  // tambien verificar por el array de correos admin
  if (
    user &&
    user.email &&
    ["darelisbatistag@gmail.com", "enmanuel676hd@gmail.com"].includes(
      user.email.toLowerCase().trim(),
    )
  ) {
    return {};
  }
  // Usuario normal: solo ve sus propios artículos
  return { ownerId: req.user._id };
}

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
    stock: body.stock === "" ? null : body.stock,
    category: body.category,
    collectionName: body.collection,
    materials: body.materials,
    description: body.description,
    published: body.published,
  };
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
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
    const ownerFilter = getOwnerFilter(req);
    const articles = await Article.find({ ...ACTIVE, ...ownerFilter })
      .populate("ownerId", "name email role")
      .sort({ createdAt: -1 });
    res.send(articles);
  } catch (err) {
    next(err);
  }
}

async function getDeletedArticles(req, res, next) {
  try {
    const ownerFilter = getOwnerFilter(req);
    const articles = await Article.find({
      deletedAt: { $ne: null },
      ...ownerFilter,
    })
      .populate("ownerId", "name email role")
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
    // Asignar el propietario del artículo al usuario autenticado
    data.ownerId = req.user._id;
    if (req.file) {
      uploaded = await uploadImage(req.file);
      data.image = uploaded.url;
      data.imagePath = uploaded.path;
    }
    const article = await Article.create(data);
    // Populate del owner para incluir la información del creador
    const populatedArticle = await Article.findById(article._id).populate(
      "ownerId",
      "name email role",
    );
    res.status(201).send(populatedArticle);
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
    const ownerFilter = getOwnerFilter(req);
    const article = await Article.findOne({
      _id: req.params.id,
      ...ACTIVE,
      ...ownerFilter,
    });
    if (!article) {
      throw new ApiError(404, "Artículo no encontrado.");
    }

    const oldPath = article.imagePath;
    article.set(pickFields(req.body));

    if (req.file) {
      uploaded = await uploadImage(req.file);
      article.image = uploaded.url;
      article.imagePath = uploaded.path;
    } else if (req.body.removeImage) {
      article.image = "";
      article.imagePath = "";
    }

    await article.save();

    // La foto anterior solo se borra cuando todo lo demás salió bien, y solo si cambió.
    if (oldPath && oldPath !== article.imagePath) {
      await tryDeleteImage(oldPath);
    }
    // Populate del owner para incluir la información del creador
    const populatedArticle = await Article.findById(article._id).populate(
      "ownerId",
      "name email role",
    );
    res.send(populatedArticle);
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
    const ownerFilter = getOwnerFilter(req);
    const article = await Article.findOneAndUpdate(
      { _id: req.params.id, ...ACTIVE, ...ownerFilter },
      { deletedAt: new Date(), published: false },
    );
    if (!article) {
      throw new ApiError(404, "Artículo no encontrado.");
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function restoreArticle(req, res, next) {
  try {
    const ownerFilter = getOwnerFilter(req);
    const article = await Article.findOneAndUpdate(
      { _id: req.params.id, deletedAt: { $ne: null }, ...ownerFilter },
      { $unset: { deletedAt: 1 } },
      { new: true },
    );
    if (!article) {
      throw new ApiError(404, "Artículo no encontrado en la papelera.");
    }
    // Populate del owner para incluir la información del creador
    const populatedArticle = await Article.findById(article._id).populate(
      "ownerId",
      "name email role",
    );
    res.send(populatedArticle);
  } catch (err) {
    next(err);
  }
}

// Borrado definitivo. Solo vale para artículos que ya están en la papelera: un artículo
// activo no se puede destruir de un solo paso, así que un clic equivocado tiene salvación.
async function destroyArticle(req, res, next) {
  try {
    const ownerFilter = getOwnerFilter(req);
    const article = await Article.findOne({
      _id: req.params.id,
      deletedAt: { $ne: null },
      ...ownerFilter,
    });
    if (!article) {
      throw new ApiError(404, "Artículo no encontrado en la papelera.");
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
