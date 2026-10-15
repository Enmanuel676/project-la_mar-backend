// Script de terminal: el resultado se lee en pantalla con console.log, también en producción,
// donde el logger no escribe en la consola (.eslintrc permite console en scripts/).
const crypto = require('crypto');
const env = require('../src/config/env');
const { getBucket } = require('../src/config/storage');

// Comprueba, de la primera pieza a la última, lo que necesita la subida de fotos en este
// servidor, y dice qué falla y cómo arreglarlo. Sube al bucket un archivo de prueba diminuto
// (en diagnostico/, no en articles/) y lo borra al terminar.

function ok(text) {
  console.log(`✓ ${text}`);
}

function fail(text, hint) {
  console.log(`✗ ${text}`);
  if (hint) {
    console.log(`  → ${hint}`);
  }
  process.exitCode = 1;
}

// sharp se carga aquí y no arriba: si sus binarios no sirven en esta máquina, el script
// explica el fallo en vez de cortarse con la traza.
async function checkSharp() {
  try {
    const sharp = require('sharp');
    const image = await sharp({
      create: {
        width: 8, height: 8, channels: 3, background: '#0a3d62',
      },
    }).webp().toBuffer();
    ok(`sharp funciona (libvips ${sharp.versions.vips}, ${sharp.concurrency()} hilos)`);
    return image;
  } catch (err) {
    fail(
      `sharp no funciona: ${err.message.split('\n')[0]}`,
      `Ejecuta "npm ci --omit=dev" en este servidor y no copies node_modules desde otro equipo. sharp necesita Node 20.9 o superior; aquí hay ${process.version}.`,
    );
    return null;
  }
}

async function checkBucket(image) {
  if (!env.gcsBucketName) {
    fail('Falta GCS_BUCKET_NAME en el .env.', 'Añádela y reinicia: pm2 restart la-mar-backend');
    return;
  }
  const path = `diagnostico/${crypto.randomUUID()}.webp`;
  const file = getBucket().file(path);

  try {
    await file.save(image, { resumable: false, contentType: 'image/webp' });
    ok(`Escritura en el bucket ${env.gcsBucketName}`);
  } catch (err) {
    fail(
      `No se puede escribir en el bucket: ${err.message}`,
      'La cuenta de servicio necesita el rol Storage Object Admin sobre el bucket. En una VM de Compute Engine, además, ámbitos de acceso con escritura en Storage (devstorage.read_write o cloud-platform).',
    );
    return;
  }

  try {
    const res = await fetch(`https://storage.googleapis.com/${env.gcsBucketName}/${path}`);
    if (res.ok && res.headers.get('content-type') === 'image/webp') {
      ok('Lectura pública de las fotos');
    } else {
      fail(
        `Las fotos no se pueden ver desde fuera (HTTP ${res.status}).`,
        'Da lectura pública al bucket: allUsers con el rol roles/storage.objectViewer (ver README).',
      );
    }
  } catch (err) {
    fail(`No se pudo comprobar la lectura pública: ${err.message}`);
  }

  try {
    await file.delete();
    ok('Borrado de fotos del bucket');
  } catch (err) {
    fail(
      `No se puede borrar del bucket: ${err.message}`,
      `El rol debe permitir borrar (Storage Object Admin; Storage Object Creator no basta). El archivo de prueba quedó en ${path}.`,
    );
  }
}

async function checkImages() {
  const image = await checkSharp();
  if (image) {
    await checkBucket(image);
  }
  console.log(process.exitCode ? '\nHay algo que corregir.' : '\nTodo listo para subir fotos.');
}

checkImages().catch((err) => fail(`Error inesperado: ${err.message}`));
