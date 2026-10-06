# Contexto: fotos en WebP, ligeras y listas para el catálogo

> **Para quien lea esto (persona o IA):** aquí está todo lo que se cambió en la subida de fotos
> de La Mar (backend, panel de administración y sitio público), por qué, cómo se probó en local
> y qué falta comprobar en el servidor de Google Cloud. Si estás aquí porque algo falló en
> producción, ve directo a [Si algo falla](#9-si-algo-falla).

- **Versiones:**
  - **v1 (2026-10-06):** conversión a WebP y compresión a 5 MB.
  - **v2 (2026-10-06, el mismo día):** se resolvieron las limitaciones de la v1 (sección 10).
    Este documento describe la v2.
- **Estado:** probado en local (Mac con Apple Silicon, Node 26.5) con un bucket simulado.
  **Todavía sin probar contra el bucket real, en la VM ni en un navegador real** (sección 6).
- **Piezas clave:** `src/utils/optimizeImage.js`, `src/middlewares/upload.js`,
  `scripts/checkImages.js`, `scripts/optimizeImages.js` y, en el panel,
  `../frontend/src/components/Dashboard/ArticleFormView.jsx`.

## 1. Qué se pidió

**Primera petición (v1).** Al subir una foto a Google Cloud Storage: si pesa más de 5 MB,
comprimirla hasta 5 MB o menos, y si es JPG o PNG, convertirla a WebP. Las dos cosas en el
momento de enviarla al bucket, para que el Catálogo del sitio público cargue lo más rápido
posible.

**Segunda petición (v2).** Resolver las limitaciones que dejó la v1:

1. El panel reducía las fotos a 900 px y las pasaba a JPEG antes de enviarlas, así que el
   backend casi nunca llegaba a comprimir.
2. Un PNG transparente llegaba con fondo negro.
3. No había lado máximo: una foto de 48 MP pesaba 2–4 MB, tardaba unos 16 s y usaba unos
   470 MB de memoria.
4. Un WebP pequeño se subía con sus metadatos (GPS) y sin enderezar.
5. Las animaciones se perdían y los GIF no se aceptaban.
6. Se procesaban varias fotos a la vez, sin cola.
7. No había forma de convertir las fotos ya subidas.
8. Los navegadores sin WebP mostraban una imagen rota.

## 2. Qué se cambió

**Backend** (`project-la_mar-backend/backend`):

| Archivo | Cambio |
| --- | --- |
| `src/utils/optimizeImage.js` | Todas las reglas de la sección 4: WebP, lado máximo de 1600 px, 5 MB como mucho, orientación, sin metadatos, animaciones, rechazo de APNG, WebP listos sin tocar y cola de una en una. |
| `src/utils/imageStorage.js` | `uploadImage` llama a `optimizeImage` justo antes de `save()`. Siempre guarda `articles/<uuid>.webp` con `Content-Type: image/webp`. Pide el bucket *antes* de procesar, para que el 503 de "no configurado" llegue al instante. |
| `src/middlewares/upload.js` | `ACCEPTED_TYPES` con JPG, PNG, WebP y **GIF**, comprobado también por la firma real del archivo (`GIF87a`/`GIF89a`). Límite de recepción de 20 MB (`MAX_MB`). |
| `scripts/checkImages.js` | **Nuevo** (`npm run images:check`). Diagnóstico para el servidor: sharp, `GCS_BUCKET_NAME`, escritura, lectura pública y borrado en el bucket, con la solución de cada fallo. |
| `scripts/optimizeImages.js` | **Nuevo** (`npm run images:optimize`). Pasa por las reglas actuales las fotos que ya están en el bucket. Admite `-- --dry-run`. |
| `package.json` / `package-lock.json` | `sharp` `^0.35.5` (libvips 8.18.7), `engines.node` `>=20.9.0` y los dos scripts nuevos. El lock incluye los binarios de Linux (`@img/sharp-linux-x64` y `@img/sharp-libvips-linux-x64`). |
| `README.md` | Formatos, reglas de las fotos, scripts nuevos y pendientes del despliegue (nginx). |

**Panel de administración** (`project-la_mar-backend/frontend`):

| Archivo | Cambio |
| --- | --- |
| `src/components/Dashboard/ArticleFormView.jsx` | Envía la **foto original**, sin convertirla. Solo la reduce en el navegador (`shrinkInBrowser`: 1600 px, WebP o PNG, nunca JPEG) si el backend no la aceptaría: otro formato que el navegador sabe abrir, como HEIC en Safari, o más de 20 MB. Vista previa con URL temporal (`blob:`) que se libera al cambiar o salir. Si la vista previa falla, la foto no se envía. `accept="image/*"` y texto de ayuda actualizado. |
| `src/lib/api.js` | Constantes `IMAGE_TYPES`, `MAX_IMAGE_MB` y `MAX_IMAGE_SIDE`, que deben coincidir con el backend (sección 4). Un `413` de nginx se muestra como "La imagen pesa demasiado para el servidor." En modo de prueba (`USE_MOCK`), la foto usa una URL temporal propia. |

**Sitio público** (`project-la_mar-frontend`):

| Archivo | Cambio |
| --- | --- |
| `src/pages/Catalog/Catalog.jsx` | Nuevo componente `CardImage`: si una foto no carga (un navegador sin WebP o una URL rota), muestra el icono de diamante de los artículos sin foto en vez de una imagen rota. También se corrigió un comentario que hablaba de `max-age=60`. El archivo ya tenía cambios tuyos sin confirmar (el `PageLoader`); no se tocaron. |

## 3. Recorrido de una foto

```
Panel (ArticleFormView.jsx → handleFile)
  JPG/PNG/WebP/GIF de hasta 20 MB  → se envía el archivo original, sin tocarlo
  otro formato (HEIC en Safari…) o más de 20 MB → shrinkInBrowser: 1600 px, WebP (o PNG)
  → FormData, campo "image" (lib/api.js → toBody)
POST /api/articles  o  PUT /api/articles/:id
  → nginx (client_max_body_size, ver sección 7)
  → auth (JWT)
  → upload.js: multer en memoria, máximo 20 MB, solo image/jpeg|png|webp|gif,
               y comprobación de los primeros bytes (la firma real del archivo)
  → validation.js (celebrate)
  → controllers/articles.js → uploadImage(req.file)          [utils/imageStorage.js]
       1. getBucket()           → 503 si falta GCS_BUCKET_NAME
       2. optimizeImage(buffer) → WebP listo (sección 4), una foto a la vez
       3. bucket.file('articles/<uuid>.webp').save(...)
          contentType image/webp, Cache-Control: public, max-age=31536000
  → en Mongo: image = https://storage.googleapis.com/<bucket>/articles/<uuid>.webp
Sitio público (Catalog.jsx) → GET /api/public/articles
  → PageLoader espera a que carguen las fotos (hasta 8 s) → CardImage → <img src={item.image}>
```

Esto ya existía y no cambió:

- Si falla el guardado del artículo, el controlador borra la foto que se acababa de subir.
- Al cambiar o quitar una foto, la anterior se borra del bucket.

## 4. Reglas de `optimizeImage`

| Entrada | Resultado |
| --- | --- |
| JPG, PNG o GIF | WebP a calidad 80, con 1600 px de lado como mucho (nunca se amplía). |
| WebP **listo** (≤ 5 MB, ≤ 1600 px y sin EXIF, XMP ni IPTC) | Se sube **tal cual**, con los mismos bytes, para no recomprimirlo. |
| WebP que no cumple alguna de esas condiciones | Se procesa como un JPG. |
| GIF o WebP animado | Sigue animado: los mismos fotogramas, tiempos y repeticiones, cada fotograma con 1600 px como mucho. |
| PNG animado (APNG, más de 1 fotograma) | `400 "Los PNG animados no se admiten. Usa un GIF o un WebP animado."` libvips solo lee su primer fotograma. |
| Resultado de más de 5 MB (en la práctica, solo animaciones largas) | Se repite a calidad 70. Si aún pasa, el lado se multiplica por `√(5 MB / peso) × 0,9` y se repite hasta que quepa. |
| Archivo dañado (firma válida, contenido roto) | `400 "No se pudo procesar la imagen. Prueba con otra foto."` y una línea `warn` en `logs/request.log` con el motivo que dio sharp. |

A todas las fotos que se convierten:

- Se les aplica la orientación EXIF (`autoOrient`), para que no salgan tumbadas.
- Se les quitan todos los metadatos, incluida la ubicación GPS del móvil.
- Si tienen transparencia (PNG), la conservan.

Decisiones de diseño, por si hay que tocar el código:

- **El formato se lee del contenido** (`sharp(buffer).metadata().format`), no del tipo que
  declara el navegador.
- **Cada intento parte del original**, nunca del resultado anterior, para no acumular pérdidas.
- **Cola de una en una** (`oneAtATime`, con una promesa encadenada). sharp ya trabaja fuera
  del hilo principal y el servidor sigue atendiendo el catálogo mientras procesa; la cola
  solo evita que dos fotos grandes a la vez sumen su memoria. Un fallo no bloquea las
  siguientes.
- **El APNG se detecta a mano** (`isAnimatedPng`), buscando el bloque `acTL` antes del
  primer `IDAT`, porque sharp no informa de él.
- **En las animaciones**, `info.height` suma todos los fotogramas; el alto de cada uno es
  `info.pageHeight`. En cambio, `metadata()` (sin `animated`) da el alto de un solo fotograma.
- **Se usa recursión y no un bucle** porque ESLint (airbnb-base) prohíbe `for...of` y `await`
  dentro de bucles. Los scripts usan `for...of` con un `eslint-disable` explicado, como
  `purgeTrash.js`. Después de cualquier cambio, hay que ejecutar `npm run lint`.

Parámetros. Los marcados con ⚠ existen en dos sitios y **deben coincidir**:

| Constante | Valor | Dónde | Qué controla |
| --- | --- | --- | --- |
| `MAX_SIDE` ⚠ | 1600 | backend `src/utils/optimizeImage.js` | Lado máximo guardado. Las tarjetas del catálogo miden como mucho unos 360 px y recortan en cuadrado: en una pantalla de densidad 3 son unos 1080 px reales. Súbelo si algún día hay una vista de detalle con zoom. |
| `MAX_IMAGE_SIDE` ⚠ | 1600 | panel `src/lib/api.js` | Lado de la reducción de último recurso en el navegador |
| `MAX_BYTES` | 5 MB | backend `src/utils/optimizeImage.js` | Peso máximo en el bucket |
| `QUALITY` / `REDUCED_QUALITY` | 80 / 70 | backend `src/utils/optimizeImage.js` | Calidad WebP normal y de reserva |
| `ACCEPTED_TYPES` ⚠ / `IMAGE_TYPES` ⚠ | JPG, PNG, WebP y GIF | backend `src/middlewares/upload.js` / panel `src/lib/api.js` | Formatos aceptados |
| `MAX_MB` ⚠ / `MAX_IMAGE_MB` ⚠ | 20 | backend `src/middlewares/upload.js` / panel `src/lib/api.js` | Peso máximo al recibir. Si se sube, hay que subir también nginx (sección 7). |

## 5. Qué se probó en local

**Prueba de `optimizeImage`** con imágenes generadas con sharp. Pasaron los 15 casos y la
prueba de la cola:

| Entrada | Salida | Tiempo |
| --- | --- | --- |
| JPG 6000×4000 tipo foto, 8,2 MB | WebP 1600×1067, **0,27 MB** | 0,2 s |
| JPG 4000×3000 de ruido puro (peor caso), 10,9 MB | WebP 1600×1200, 0,66 MB | 0,26 s |
| PNG 2500×2500, 17,5 MB | WebP 1600×1600, 1,17 MB | 0,32 s |
| PNG 300×300 con transparencia | WebP 300×300 con transparencia (sin ampliar) | — |
| JPG con ubicación GPS en el EXIF | WebP sin metadatos | — |
| WebP 800×600 limpio | Los mismos bytes | 0 s |
| WebP 800×600 con EXIF de giro de 90° | WebP 600×800, enderezado y sin metadatos | — |
| WebP 3000×2000 limpio | WebP 1600×1067, 0,20 MB | 0,17 s |
| GIF de 3 fotogramas 400×300 | WebP animado de 3 fotogramas, con los mismos tiempos | — |
| GIF de 4 fotogramas 2400×2000, 19,4 MB | WebP animado de 4 fotogramas 1600×1333, 0,07 MB | 0,66 s |
| WebP animado limpio y pequeño | Los mismos bytes, sigue animado | 0 s |
| WebP animado de ruido, 12 fotogramas 1200×1200, 13,9 MB | WebP animado 894×894, 3,08 MB (calidad 80 y 70 no cabían; se redujo) | 6,8 s |
| APNG de 2 fotogramas | Error 400 "Los PNG animados no se admiten…" | — |
| PNG con `acTL` de 1 fotograma | Se acepta como imagen fija | — |
| JPG dañado | Error 400 "No se pudo procesar la imagen…" | — |
| **Cola:** 3 fotos a la vez, la del medio dañada | Bien, error 400, bien, en orden de llegada | — |

**Memoria y tiempo**, medidos en el Mac (6 núcleos, 2 hilos de libvips según
`sharp.concurrency()`). La memoria es el máximo del proceso completo, incluidos los 72 MB que
usa Node con sharp en reposo:

| Caso | v1 (sin lado máximo) | v2 |
| --- | --- | --- |
| Foto de 48 MP (8000×6000), JPG de 12,4 MB | 15–17 s, 467 MB, 3,94 MB guardados | **0,23 s, 119 MB, 0,19 MB guardados** |
| Foto de 24 MP (6000×4000), JPG de 6,2 MB | 1,6 s, 266 MB, 2,78 MB | **0,19 s, 112 MB, 0,26 MB** |
| 3 fotos de 24 MP a la vez (con la cola) | — | 0,57 s en total, 133 MB |
| WebP animado de ruido, 12 fotogramas, 13,9 MB (peor caso) | — | 6,6 s, 265 MB |
| GIF de 60 fotogramas 800×800, 24 MB | — | 2,2 s, 152 MB |
| Referencia: Node con sharp cargado, sin trabajo | 72 MB | 72 MB |

**Prueba de extremo a extremo** con la app real (multer, validación, controlador y
`uploadImage`), un bucket simulado y una base de datos temporal, ya borrada:

1. **Artículo en borrador con una foto original de 8,2 MB.** Responde 201 y guarda un WebP de
   1600×1067 y 0,27 MB, con URL `.webp`.
2. **Cambio de foto por un GIF animado.** Guarda un WebP animado de 3 fotogramas y la foto
   anterior se borra del bucket.
3. **WebP limpio.** Se suben los mismos bytes.
4. **Publicación.** El artículo aparece en `/api/public/articles` con su URL `.webp`.
5. **Archivo de 21 MB.** Responde `400 "La imagen no puede pesar más de 20 MB."`.
6. **JPG dañado y APNG.** Responden 400; no se crea el artículo y no se sube nada.

**Scripts**, ejecutados como procesos aparte con bucket y base de datos temporales:

- `images:optimize --dry-run` informó sin cambiar nada:
  - JPG antiguo: "se optimizaría (3,08 MB → 0,30 MB)".
  - PNG en la papelera: "se optimizaría (7,80 MB → 0,36 MB)".
  - WebP listo: "ya estaba optimizada".
  - Foto que falta en el bucket: "ERROR, la foto no está en el bucket".
  - URL externa: contada aparte y sin tocar.
  - Salió con código 1 por el error.
- `images:optimize` aplicó los cambios: los artículos pasaron a `articles/<uuid>.webp`, las
  fotos viejas se borraron y `updatedAt` **no** cambió. Ejecutado otra vez, todo salió como
  "ya estaba optimizada"; se puede repetir sin riesgo.
- `images:check` se probó en cuatro casos: todo bien (✓ en todo y no deja restos), sin permiso
  de escritura, sin lectura pública y sin `GCS_BUCKET_NAME`. En cada fallo muestra ✗ con su
  solución y sale con código 1.

**Frontends:** ESLint sin avisos (todo el panel; en el sitio público, la carpeta del
catálogo, porque el resto tiene cambios tuyos en curso) y build correcto en los dos. El build
se hizo en una carpeta temporal; tus `dist` no se tocaron.

**Comprobaciones finales:** `npm run lint` del backend sin errores. Tu servidor de desarrollo
se reinició con el código nuevo y el login y el catálogo responden.

## 6. Qué NO se ha probado (pendiente)

- **En un navegador real:**
  - El panel eligiendo fotos en un iPhone, un Android y un Mac.
  - Un HEIC en Safari, que debe convertirse; en Chrome debe salir el mensaje de error.
  - Un PNG transparente y un GIF de principio a fin.
  - El icono de respaldo del catálogo.
- **En Google Cloud:**
  - La subida real al bucket, incluidos el `Content-Type` y el `Cache-Control` del objeto.
  - sharp en la VM.
  - Tiempo y memoria en la CPU de la VM.
  - Los límites de nginx.

## 7. Lista de comprobación del despliegue (lo que afecta a las fotos)

1. **Node 20.9 o superior en la VM**, mejor 22 o 24 (LTS); Node 20 dejó de tener soporte en
   abril de 2026. Compruébalo con `node -v`.
2. **Instalar las dependencias en la propia VM:** `npm ci --omit=dev`.
   - **No copies `node_modules` desde el Mac:** solo trae los binarios de sharp para macOS
     (`darwin-arm64`), y en Linux el servidor no arrancaría.
   - No uses `--omit=optional`: los binarios de sharp son dependencias opcionales.
   - Puede salir un aviso de npm sobre `allowScripts` que nombra a `bcrypt` y `fsevents`.
     sharp no tiene script de instalación, así que ese aviso no le afecta.
3. **Ampliar el límite de nginx. Ahora es imprescindible:** el panel envía la foto original
   (de 2 a 8 MB en un móvil) y nginx solo admite 1 MB por defecto (`client_max_body_size`).
   Sin esto, el panel muestra "La imagen pesa demasiado para el servidor."
   ```nginx
   server {
       # El backend admite fotos de hasta 20 MB; un poco más por los otros campos del formulario.
       client_max_body_size 25m;
       location /api/ {
           proxy_pass http://localhost:3000;
       }
   }
   ```
   Después: `sudo nginx -t && sudo systemctl reload nginx`.
4. **Dar a la VM permiso de escritura en el bucket.** Hay que revisar dos cosas:
   - **IAM:** la cuenta de servicio de la VM necesita el rol `Storage Object Admin` sobre el
     bucket, para crear y borrar objetos.
   - **Ámbitos de acceso de la VM:** con los ámbitos por defecto de Compute Engine, Storage es
     **de solo lectura**, y la subida falla aunque el rol IAM esté bien. Compruébalo con:
     ```bash
     gcloud compute instances describe NOMBRE_VM --zone ZONA --format="yaml(serviceAccounts)"
     ```
     Debe aparecer `devstorage.read_write` o `cloud-platform`. Para cambiarlo, detén la VM y
     ejecuta:
     ```bash
     gcloud compute instances set-service-account NOMBRE_VM --zone ZONA \
       --service-account CORREO_DE_LA_CUENTA --scopes cloud-platform
     ```
5. **Variables en el `.env` del servidor:**
   - `GCS_BUCKET_NAME` (sin ella no se pueden subir fotos) y `GCS_PROJECT_ID`.
   - `GOOGLE_APPLICATION_CREDENTIALS` se deja vacía en la VM (ver README).

   El `.env` se lee al arrancar: tras cambiarlo, `pm2 restart la-mar-backend`.
6. **Comprobar todo de una vez** desde la carpeta `backend`: `npm run images:check`. Debe
   terminar con "Todo listo para subir fotos."; si algo falla, indica la solución.
7. **Si ya había fotos en el bucket antes de este cambio:** primero
   `npm run images:optimize -- --dry-run` para ver qué haría, y después
   `npm run images:optimize`.
8. **Memoria.** Con el lado máximo, procesar una foto de 48 MP suma unos 50 MB a lo que ya usa
   el proceso (en la prueba, 119 MB en total frente a 72 MB en reposo). Lo más pesado son las
   animaciones largas: unos 190 MB más en el peor caso medido (265 MB en total). La cola
   impide que se sumen. Una VM de 1 GB con MongoDB dentro debería bastar; si no, añade swap.

## 8. Pruebas reales en el servidor

**A. Desde el panel.** Ahora sí recorre todo el procesamiento, porque envía la foto original:

1. **Crear un artículo en borrador con una foto original del móvil** (varios MB). La tarjeta
   debe mostrar la foto y su URL debe terminar en `.webp`.
2. **Revisar las cabeceras de la foto:**
   ```bash
   curl -sI "URL_DE_LA_FOTO" | grep -iE 'content-type|content-length|cache-control'
   ```
   Deben salir `image/webp`, un `content-length` de unos cientos de KB y
   `public, max-age=31536000`. También sirve
   `gcloud storage objects describe gs://BUCKET/articles/UUID.webp` (campos `content_type`,
   `size` y `cache_control`). Para ver las medidas, abre la URL en el navegador: el lado
   mayor debe ser de 1600 px o menos.
3. **Publicar el artículo.** Debe aparecer con su foto en el Catálogo del sitio público.
4. **Subir una foto vertical hecha con el móvil.** Debe verse derecha.
5. **Subir un PNG con fondo transparente.** Debe verse sin fondo negro, en la vista previa y
   en el catálogo.
6. **Subir un GIF animado.** Debe seguir animado en el catálogo.
7. **Subir una foto HEIC desde Safari en Mac.** Se convierte en el navegador. En Chrome debe
   salir "No se pudo leer esa imagen…", que es lo esperado.
8. **Cambiar la foto, quitarla y eliminar el artículo definitivamente.** Tras cada paso, la
   foto anterior debe desaparecer del bucket: `gcloud storage ls gs://BUCKET/articles/`.

**B. Directo a la API.** Sirve para los errores y para medir tiempos. Los comandos funcionan
desde el Mac o desde la VM:

```bash
API=https://TU_DOMINIO/api      # o http://IP_DE_LA_VM:3000/api mientras no haya dominio
TOKEN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"TU_CORREO","password":"TU_CONTRASEÑA"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

# Foto grande. Pon siempre ";type=": curl no reconoce todos los tipos.
curl -s -X POST "$API/articles" -H "Authorization: Bearer $TOKEN" \
  -F name='Prueba foto grande' -F price=1 -F category=Anillos -F published=false \
  -F 'image=@/ruta/foto-grande.jpg;type=image/jpeg' \
  -w '\nHTTP %{http_code} en %{time_total} s\n'
# Esperado: 201 e "image" terminada en .webp.

# PNG animado (APNG): esperado 400 "Los PNG animados no se admiten…"
# Más de 20 MB: esperado 400 "La imagen no puede pesar más de 20 MB."
head -c 21000000 /dev/urandom > /tmp/grande.bin
curl -s -X POST "$API/articles" -H "Authorization: Bearer $TOKEN" \
  -F name='Prueba' -F price=1 -F category=Anillos -F 'image=@/tmp/grande.bin;type=image/jpeg'
# Si en vez de eso llega un 413 en HTML, es el límite de nginx (sección 7, punto 3).

# Limpieza de cada artículo de prueba (también borra su foto del bucket):
curl -s -X DELETE "$API/articles/ID" -H "Authorization: Bearer $TOKEN"
curl -s -X DELETE "$API/articles/ID/permanent" -H "Authorization: Bearer $TOKEN" -w 'HTTP %{http_code}\n'
```

**Dónde mirar:**

- **`npm run images:check`:** es lo primero que hay que ejecutar.
- **`pm2 logs la-mar-backend`:** errores al arrancar, por ejemplo si sharp no carga. En
  producción el logger no escribe en la consola, así que lo demás no sale aquí.
- **`backend/logs/request.log`:** cada petición con su código y su tiempo (por ejemplo
  `POST /api/articles 201 250ms`), y las líneas `No se pudo procesar una imagen: <motivo>`.
- **`backend/logs/error.log`:** los errores 500, con su traza.

## 9. Si algo falla

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| El servidor no arranca y PM2 lo reinicia en bucle. En los logs aparece `Could not load the "sharp" module using the linux-x64 runtime` | `node_modules` copiado del Mac, dependencias opcionales omitidas o Node anterior a 20.9 | En la VM: `rm -rf node_modules && npm ci --omit=dev`, y revisar `node -v`. sharp se carga al arrancar, por eso se cae todo el servidor y no solo las fotos. `images:check` lo confirma |
| El panel muestra "La imagen pesa demasiado para el servidor." | nginx corta la petición (1 MB por defecto) | `client_max_body_size 25m;` (sección 7, punto 3) |
| `503 "El almacenamiento de imágenes no está configurado."` | Falta `GCS_BUCKET_NAME` | Añadirla al `.env` y ejecutar `pm2 restart la-mar-backend` |
| `500 "Ha ocurrido un error en el servidor."` al subir. En `error.log` aparece `does not have storage.objects.create access`, `Provided scope(s) are not authorized` u otro 403 | Permisos de la VM sobre el bucket | `npm run images:check` dice cuál falta: rol IAM o ámbitos de acceso (sección 7, punto 4) |
| `400 "No se pudo procesar la imagen..."` con una foto que parece correcta | sharp es estricto por defecto (`failOn: 'warning'`) y rechaza archivos con daños leves | Ver el motivo en `request.log`. Si la foto es válida, añadir `failOn: 'error'` en las **dos** llamadas a `sharp(...)` de `optimize`/`toWebp` en `optimizeImage.js` |
| `400 "Los PNG animados no se admiten..."` | Es un APNG; libvips no puede leer su animación | Exportarlo como GIF o WebP animado. Es intencionado (sección 10) |
| `400 "La imagen no puede pesar más de 20 MB."` (solo por la API; el panel reduce antes) | Archivo original de más de 20 MB | Subir `MAX_MB` y `MAX_IMAGE_MB` a la vez, y el límite de nginx |
| El panel dice "No se pudo leer esa imagen…" al elegir una foto | Formato que ni el backend acepta ni el navegador sabe abrir (HEIC en Chrome, por ejemplo) | Exportarla como JPG. Es lo esperado |
| Subida lenta | Animación muy larga o CPU lenta | Mirar los tiempos en `request.log`. Opciones: bajar el esfuerzo de codificación (`.webp({ quality, effort: 2 })`; por defecto es 4) o el lado máximo |
| El proceso muere durante una subida (sin memoria) | Animación enorme en una VM pequeña | Añadir swap o RAM, o bajar `MAX_MB` |
| El catálogo muestra el icono del diamante en vez de la foto | La foto no carga: el bucket no tiene lectura pública, la URL está rota o el navegador es muy antiguo y no admite WebP | Abrir la URL de la foto directamente; `images:check` comprueba la lectura pública |
| Un artículo recién publicado no aparece en el catálogo | Caché delante de la API o build antiguo del sitio público | Ver sección 11 |

## 10. Limitaciones de la v1: cómo quedaron

| Limitación de la v1 | Solución en la v2 |
| --- | --- |
| 1. El panel reducía a 900 px en JPEG y el backend casi nunca comprimía | El panel envía el original y el backend hace todo. Solo se reduce en el navegador como último recurso, cuando el backend no lo aceptaría |
| 2. PNG transparente con fondo negro | Ya no se pasa por JPEG: el original llega intacto, y el último recurso sale en WebP o PNG, que conservan la transparencia |
| 3. Sin lado máximo (2–4 MB por foto, 16 s y 470 MB con 48 MP) | `MAX_SIDE = 1600`: 0,2–0,3 MB por foto, 0,2 s y 120 MB |
| 4. WebP pequeño con metadatos (GPS) y sin enderezar | Un WebP solo se sube tal cual si está listo (≤ 5 MB, ≤ 1600 px y sin EXIF, XMP ni IPTC); si no, se procesa |
| 5. Animaciones perdidas y GIF no aceptados | Se aceptan los GIF y los GIF y WebP animados siguen animados. El APNG se rechaza con un mensaje claro en vez de perder la animación sin avisar |
| 6. Fotos procesadas a la vez, sin cola | Cola de una en una, para que no se sume la memoria. sharp trabaja fuera del hilo principal, así que el servidor sigue atendiendo mientras procesa, y con el lado máximo cada foto tarda décimas de segundo |
| 7. Fotos ya subidas sin convertir | `npm run images:optimize` (con `--dry-run`): idempotente, no cambia `updatedAt` y no pisa una foto cambiada mientras tanto |
| 8. Navegadores sin WebP | El catálogo muestra el icono de respaldo en vez de una imagen rota |
| Riesgos de despliegue (nginx, permisos, `node_modules`) | Son configuración del servidor y no se arreglan con código. `npm run images:check` los detecta y explica, y la sección 7 los detalla |

**Lo que queda, a propósito o porque no se puede resolver de otra forma:**

1. **PNG animados (APNG):** se rechazan. libvips, el motor de sharp, solo lee su primer
   fotograma.
2. **Navegadores sin WebP** (Safari anterior a la 14, de 2020): ven el icono, no la foto. Dar
   la foto también en JPEG duplicaría el almacenamiento y el código para muy pocos visitantes.
3. **No se guarda el original.** Si más adelante se sube `MAX_SIDE`, las fotos ya guardadas
   siguen en 1600 px; `images:optimize` no puede ampliarlas.
4. **Subir desde el móvil tarda algo más que en la v1:** viajan varios MB en vez de unos
   150 KB. Es el precio de conservar la calidad, la transparencia y las animaciones.
5. **Último recurso del panel** (HEIC o más de 20 MB): solo funciona en navegadores que saben
   abrir ese formato (HEIC en Safari sí, en Chrome no), y una animación de más de 20 MB queda
   en su primer fotograma.
6. **Modo de prueba del panel** (`USE_MOCK`, desactivado): una foto nueva se ve hasta recargar
   la página.
7. **sharp estricto** (`failOn: 'warning'`): un archivo ligeramente dañado se rechaza (ver
   sección 9).
8. **La foto se procesa dentro de la petición** (con cola). Con un administrador sobra; con
   muchos subiendo a la vez, habría que pasar a un trabajo en segundo plano.

## 11. Otro cambio del mismo día: catálogo y borradores

Se revisó un problema: un artículo creado como borrador y publicado después no aparecía en el
catálogo.

- **La lógica del backend funcionaba.** Se probó borrador → editar → publicar, en JSON y en
  multipart.
- **Lo único que podía retrasarlo era la caché** de `GET /api/public/articles`. En
  `src/controllers/public.js`, `Cache-Control: public, max-age=60` pasó a **`no-cache`**: el
  navegador puede guardar la respuesta, pero siempre la revalida con el ETag, y el servidor
  responde 304 si nada cambió.
- **El sitio público** pide el catálogo con `cache: 'no-store'` (`Catalog.jsx`). Su
  `PageLoader` espera a que carguen las fotos (hasta 8 s), así que unas fotos más ligeras
  acortan esa espera.
- **Si en producción vuelve a pasar,** comprobar que nginx o una CDN no añaden caché propia
  (`proxy_cache`, `expires`) y que el sitio público desplegado es una versión reciente.

## 12. Cómo pedir una corrección a la IA

Pásale este archivo con un mensaje como este:

> Lee `backend/image-context.md`. En el servidor de Google Cloud pasa esto: **[qué hiciste y
> qué esperabas]**. El backend respondió **[código y mensaje]**. `npm run images:check` dice:
> **[salida]**. En `logs/error.log`, `logs/request.log` o `pm2 logs` aparece: **[líneas]**.
> Corrígelo respetando lo que describe el documento y ejecuta `npm run lint` al terminar.
