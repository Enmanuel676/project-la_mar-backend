const sharp = require('sharp');
const ApiError = require('./ApiError');
const logger = require('../config/logger');

// Lo máximo que puede pesar una foto en el bucket.
const MAX_BYTES = 5 * 1024 * 1024;
// Lado máximo de la foto guardada. Las tarjetas del catálogo miden como mucho unos 360 px de
// ancho y recortan la foto en cuadrado: en una pantalla de densidad 3 son unos 1080 px reales.
// 1600 cubre ese caso con margen y deja una foto de móvil en unos cientos de KB. Si algún día
// hay una vista de detalle con zoom, este es el valor que hay que subir.
const MAX_SIDE = 1600;
// Calidad del WebP. Con 80 la foto apenas se distingue del original; a 70 solo se baja si con
// 80 no cabe en 5 MB, algo que con el lado máximo solo pasa con animaciones largas.
const QUALITY = 80;
const REDUCED_QUALITY = 70;

// Las fotos se procesan de una en una. sharp trabaja fuera del hilo principal, así que el
// servidor sigue atendiendo peticiones mientras tanto; la cola solo evita que dos fotos
// grandes a la vez sumen su memoria en una VM pequeña.
let queue = Promise.resolve();
function oneAtATime(task) {
  const result = queue.then(task);
  queue = result.catch(() => {}); // un fallo no debe bloquear las fotos siguientes
  return result;
}

// libvips solo lee el primer fotograma de un PNG animado (APNG): en vez de perder la animación
// sin avisar, se rechaza. Un PNG animado lleva un bloque acTL antes de los datos de la imagen.
function isAnimatedPng(buffer) {
  let offset = 8; // después de la firma PNG
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    if (type === 'acTL') {
      return buffer.readUInt32BE(offset + 8) > 1; // número de fotogramas
    }
    if (type === 'IDAT') {
      return false;
    }
    offset += 12 + buffer.readUInt32BE(offset); // longitud + tipo + datos + CRC
  }
  return false;
}

// Una foto está lista si ya es lo que se guardaría: WebP de 5 MB o menos, dentro del lado
// máximo y sin metadatos (EXIF, XMP o IPTC, que pueden llevar la ubicación GPS o un giro
// pendiente). Se sube tal cual, porque volver a comprimirla solo le quitaría calidad.
// En una animación, `height` es la de un fotograma.
function isReady(meta, size) {
  return meta.format === 'webp'
    && size <= MAX_BYTES
    && meta.width <= MAX_SIDE
    && meta.height <= MAX_SIDE
    && !meta.exif && !meta.xmp && !meta.iptc;
}

function toWebp(input, quality, maxSide) {
  // animated: conserva todos los fotogramas de un GIF o un WebP animado; en una foto normal no
  // cambia nada. autoOrient: los móviles guardan la foto tumbada y una etiqueta EXIF dice cómo
  // girarla. Al convertir se pierden los metadatos (también la ubicación GPS), así que el giro
  // se aplica antes.
  return sharp(input, { animated: true, autoOrient: true })
    .resize({
      width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true,
    })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });
}

// Convierte a WebP y, si el resultado pasa de 5 MB, lo repite más ligero: primero con menos
// calidad y después con menos píxeles. Cada intento parte del original, para no sumar la
// pérdida de una compresión encima de la de otra.
async function toWebpWithinLimit(input, quality = QUALITY, maxSide = MAX_SIDE) {
  const { data, info } = await toWebp(input, quality, maxSide);
  if (data.length <= MAX_BYTES) {
    return data;
  }
  if (quality > REDUCED_QUALITY) {
    return toWebpWithinLimit(input, REDUCED_QUALITY, maxSide);
  }
  // El peso va más o menos con el número de píxeles, que crece con el cuadrado del lado: por
  // eso el lado se reduce con la raíz de lo que sobra, más un 10 % de margen para que casi
  // siempre baste con una vuelta. En una animación, `height` suma todos los fotogramas y el
  // de cada uno es `pageHeight`.
  const side = Math.max(info.width, info.pageHeight || info.height);
  const scale = Math.sqrt(MAX_BYTES / data.length) * 0.9;
  return toWebpWithinLimit(input, quality, Math.floor(side * scale));
}

async function optimize(buffer) {
  // El formato se lee del contenido, no del tipo que declara el navegador.
  const meta = await sharp(buffer).metadata();
  if (meta.format === 'png' && isAnimatedPng(buffer)) {
    throw new ApiError(400, 'Los PNG animados no se admiten. Usa un GIF o un WebP animado.');
  }
  if (isReady(meta, buffer.length)) {
    return buffer;
  }
  return toWebpWithinLimit(buffer);
}

// Deja la foto lista para el bucket y para que el catálogo cargue rápido: siempre en WebP,
// con 5 MB y MAX_SIDE px de lado como mucho, derecha y sin metadatos. Las animaciones de los
// GIF y los WebP se conservan.
async function optimizeImage(buffer) {
  try {
    return await oneAtATime(() => optimize(buffer));
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    // La firma del archivo ya se comprobó al recibirlo (middlewares/upload.js): si aun así no
    // se puede procesar, el archivo está dañado.
    logger.warn(`No se pudo procesar una imagen: ${err.message}`);
    throw new ApiError(400, 'No se pudo procesar la imagen. Prueba con otra foto.');
  }
}

module.exports = { optimizeImage };
