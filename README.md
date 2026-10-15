# Backend · La Mar

**API en producción:** `https://api.lamarjoyeria.mooo.com/api` (por HTTPS). Prueba pública:
<https://api.lamarjoyeria.mooo.com/api/public/articles>

API de la joyería La Mar. Da servicio a dos sitios web:

1. **Sitio público** (`project-la_mar-frontend`): solo lee el catálogo con `GET /api/public/articles`.
2. **Panel de administración** (`project-la_mar-backend/frontend`): inicia sesión y crea, edita,
   elimina y restaura artículos, con su foto.

## Stack

- Node.js + Express
- MongoDB con Mongoose
- JWT (`jsonwebtoken`) y bcrypt para las contraseñas
- Validación con celebrate (Joi) + `validator`
- Registros con winston
- ESLint con airbnb-base
- Además, por necesidad: `dotenv` (variables de entorno), `cors`, `multer` (recibir la foto),
  `sharp` (convertirla a WebP y comprimirla) y `@google-cloud/storage` (guardarla en el bucket)

## Estructura

```
src/
  config/        env.js, db.js, logger.js, storage.js
  models/        article.js, user.js
  controllers/   auth.js, articles.js, public.js
  routes/        index.js, auth.js, articles.js, public.js
  middlewares/   auth.js, upload.js, validation.js, requestLogger.js, errorHandler.js
  utils/         ApiError.js, imageStorage.js, optimizeImage.js, purgeTrash.js
  app.js         Express: CORS, rutas, 404 y manejo de errores
  server.js      conecta a MongoDB, escucha y programa la purga
scripts/
  createAdmin.js     crea (o restablece la contraseña de) el administrador
  checkImages.js     comprueba en el servidor todo lo que necesita la subida de fotos
  optimizeImages.js  pasa por las reglas actuales las fotos que ya están en el bucket
```

## Puesta en marcha en local

Requisitos: Node.js 20.9+ (lo exige `sharp`) y MongoDB corriendo en `localhost:27017`.

```bash
cd backend
npm install
cp .env.example .env     # y edita .env (ver más abajo)
npm run seed:admin       # crea el administrador
npm run dev              # arranca con recarga automática (o `npm start`)
```

En `.env` lo único obligatorio es `MONGODB_URI` y `JWT_SECRET`. Si falta una, el servidor no
arranca y el error dice cuál. El `.env` se busca siempre en `backend/`, no importa desde qué
carpeta lances el comando.

### Administrador

No hay registro público (`POST /signup`) a propósito: las cuentas se crean desde la terminal.
`npm run seed:admin` lee `ADMIN_EMAIL`, `ADMIN_NAME` y `ADMIN_PASSWORD` (8 a 128 caracteres) del `.env`
o de la propia línea de comandos. Sin ellos usa
`admin@lamar.com` / `lamar2026`, que **solo sirve para local**: con `NODE_ENV=production` el
script se niega a usar esa contraseña.

Para cambiar la contraseña, vuelve a ejecutar el script con la nueva: si el correo ya existe,
solo se actualiza. Para añadir más administradores, o ver y editar artículos, puedes usar
MongoDB Compass: colecciones `users` y `articles` de la base `la_mar`. La contraseña se guarda
con bcrypt, así que no se puede escribir a mano en Compass; usa el script.

## Endpoints

Todos bajo `/api`. Los del panel llevan la cabecera `Authorization: Bearer <token>`.
Los errores siempre responden `{ "message": "..." }` en español.

| Método | Ruta | Auth | Descripción |
| ------ | ---- | :--: | ----------- |
| POST | `/auth/login` | no | `{ email, password }` → `{ token, user: { email, name } }` |
| GET | `/articles` | sí | Artículos activos, el más nuevo primero |
| POST | `/articles` | sí | Crea un artículo (JSON o `multipart/form-data` con foto) |
| PUT | `/articles/:id` | sí | Edita. Acepta cambios parciales, p. ej. `{ "published": true }` |
| DELETE | `/articles/:id` | sí | Lo manda a la papelera y lo despublica (204) |
| GET | `/articles/deleted` | sí | Papelera |
| POST | `/articles/:id/restore` | sí | Lo saca de la papelera (vuelve como borrador) |
| DELETE | `/articles/:id/permanent` | sí | Borrado definitivo; solo si ya está en la papelera (204) |
| GET | `/public/articles` | no | Artículos publicados, para el sitio público |

### Artículo

```
id, name, price, currency ('USD' | 'CUP'), stock (null = sin límite), category
('Anillos' | 'Collares' | 'Pendientes' | 'Pulseras' | 'Relojes'), collection, materials,
description, image (URL pública), published, createdAt, updatedAt, deletedAt (en la papelera)
```

Obligatorios al crear: `name`, `price` y `category`. El precio es **uno solo, en la moneda
elegida** (`currency`); el sitio público muestra ese precio con su moneda.

`GET /public/articles` devuelve solo `name, price, currency, stock, category, collection,
materials, description, image, createdAt, id`. Los campos internos nunca salen.

## Fotos

- Se envían como archivo en el campo `image` de un `multipart/form-data` (no como URL ni
  como texto en base64). JPG, PNG, WebP o GIF, hasta 20 MB. Se comprueba también el contenido
  real del archivo, no solo el tipo que declara el navegador. El panel envía la foto original.
- Justo antes de subirla, el servidor la prepara para que el catálogo cargue rápido
  (`src/utils/optimizeImage.js`):
  - Siempre en WebP (calidad 80) y con 1600 px de lado como mucho.
  - Nunca por encima de 5 MB. Si no cabe, baja la calidad a 70 y, si aun así no basta,
    reduce las dimensiones; en la práctica solo hace falta con animaciones largas.
  - Derecha según la orientación EXIF y sin metadatos (ni ubicación GPS ni EXIF, XMP o IPTC).
  - Los GIF y WebP animados siguen animados. Los PNG animados (APNG) se rechazan con un
    mensaje, porque solo se podría guardar su primer fotograma.
  - Un WebP que ya cumple todo lo anterior se sube tal cual, para no recomprimirlo.
  - Las fotos se procesan de una en una, para que dos grandes a la vez no sumen su memoria.
- El servidor las sube a Google Cloud Storage con un nombre aleatorio (siempre `.webp`) y guarda
  la URL pública en `image`. Para quitar la foto de un artículo sin poner otra: `removeImage=true`.
- `npm run images:check` comprueba en el servidor `sharp`, la configuración del bucket y los
  permisos de escritura, lectura pública y borrado, y explica cómo arreglar lo que falle.
- `npm run images:optimize` pasa las fotos que ya están en el bucket por las reglas actuales
  (las que ya las cumplen no se tocan). Con `-- --dry-run` solo informa, sin cambiar nada.
- Al cambiar o quitar una foto, o al eliminar un artículo definitivamente, la foto vieja se
  borra del bucket.

### Bucket de Google Cloud Storage

```bash
gcloud storage buckets create gs://NOMBRE_DEL_BUCKET --location=us-central1
# Lectura pública de las fotos (se sirven directamente desde el bucket):
gcloud storage buckets add-iam-policy-binding gs://NOMBRE_DEL_BUCKET \
  --member=allUsers --role=roles/storage.objectViewer
```

En local: crea una cuenta de servicio con el rol `Storage Object Admin` sobre el bucket,
descarga su clave JSON (fuera del repositorio) y pon en `.env` `GCS_BUCKET_NAME` y
`GOOGLE_APPLICATION_CREDENTIALS` (ruta **absoluta** al JSON). En la VM de producción se usa
la cuenta de servicio de la instancia, y esa variable se deja vacía.

Sin `GCS_BUCKET_NAME` todo lo demás funciona; solo la subida de fotos responde 503.

## Papelera

Eliminar un artículo lo manda a la papelera y lo despublica. A los `TRASH_RETENTION_DAYS`
(30) días, el propio servidor lo borra definitivamente junto con su foto del bucket. La purga
corre al arrancar y cada 24 horas. No se usa un índice TTL de Mongo porque este solo borraría
el documento y dejaría la foto huérfana.

## CORS

- `/api/auth` y `/api/articles` solo aceptan los orígenes de `ALLOWED_ORIGINS` (separados por
  coma). Añade ahí el dominio del panel cuando lo despliegues. En desarrollo
  (`NODE_ENV` distinto de `production`) se acepta además cualquier `http://localhost:<puerto>`,
  así el panel funciona aunque Vite lo abra en el 5174 o en otro puerto.
- `/api/public` acepta cualquier origen, pero solo `GET`.

## Registros

`logs/request.log` (todas las peticiones y eventos) y `logs/error.log` (solo errores), en
JSON. En desarrollo también salen por la terminal. Los archivos no rotan solos: en el servidor
conviene `pm2 install pm2-logrotate` o `logrotate`.

## Comandos

```bash
npm run dev              # desarrollo, con recarga
npm start                # producción (lo que ejecuta PM2)
npm run seed:admin       # crear administrador / cambiar contraseña
npm run images:check     # diagnóstico de la subida de fotos (sharp y bucket)
npm run images:optimize  # optimizar las fotos que ya están en el bucket (-- --dry-run: simular)
npm run lint             # ESLint airbnb-base
```

## Pendiente para el despliegue (fase 2)

- Variables de producción: `NODE_ENV=production`, un `JWT_SECRET` de 32+ caracteres (el
  servidor lo exige), `ADMIN_PASSWORD` propia y `ALLOWED_ORIGINS` con el dominio del panel.
- nginx como proxy inverso hacia el puerto de la API, SSL con Certbot y PM2
  (`pm2 start ecosystem.config.js`). En nginx, `client_max_body_size 25m;`: por defecto
  admite 1 MB y cortaría las fotos que envía el panel, que pueden llegar a 20 MB.
- Instalar dependencias en el propio servidor con `npm ci --omit=dev` (nunca copiar
  `node_modules` desde el Mac) y comprobar las fotos con `npm run images:check`. Detalles en
  `image-context.md`.
- Limitar intentos de login: no hay límite en el backend; se puede añadir `limit_req` en nginx
  sobre `/api/auth/login`.
