# Backend · La Mar

**API en producción:** `https://api.lamarjoyeria.mooo.com/api`
Prueba pública: <https://api.lamarjoyeria.mooo.com/api/public/articles>

API de la joyería La Mar. Da servicio a:

1. **Sitio público** (`project-la_mar-frontend`): lee el catálogo con `GET /api/public/articles`.
2. **Panel de administración** (`project-la_mar-administration`): gestiona artículos, usuarios y sesiones.

## Stack

- Node.js + Express
- MongoDB (Mongoose)
- JWT + bcrypt
- Validación con celebrate (Joi)
- Logs con winston
- Fotos: `multer` + `sharp` + Google Cloud Storage

## Puesta en marcha

Requisitos: Node.js 20.9+ y MongoDB en `localhost:27017`.

```bash
npm install
cp .env.example .env   # obligatorio: MONGODB_URI y JWT_SECRET
npm run dev            # o `npm start` en producción
```

Para entrar al panel necesitas una cuenta: créala desde el propio panel (`POST /auth/register`) o, en un entorno sin interfaz, con `npm run seed:admin` (lee `ADMIN_EMAIL`, `ADMIN_NAME` y `ADMIN_PASSWORD`).

## Endpoints

Todos bajo `/api`. Errores siempre como `{ "message": "..." }` en español.

### Información de la API

| Método | Ruta | Auth | Descripción |
| ------ | ---- | :--: | ----------- |
| GET | `/api` | no | **Documentación de todos los endpoints disponibles (JSON)** |

### Autenticación

| Método | Ruta | Auth | Descripción |
| ------ | ---- | :--: | ----------- |
| POST | `/signin` | no | `{ email, password }` → `{ token, user }` |
| POST | `/signup` | no | `{ firstName, lastName, email, password }` → `{ token, user }` |
| POST | `/signup` | no | Alias de `/signup` (requisito Etapa 2) |
| POST | `/auth/logout` | no | Borra la cookie de sesión (204) |
| GET | `/users/me` | sí | Datos del usuario del token, **sin contraseña ni hash** |

**Cookie de sesión:** login y registro guardan el token en una cookie `lamar_token` (`HttpOnly`, `SameSite=Lax`). El middleware `auth` acepta la cabecera `Authorization: Bearer` o esa cookie; la cabecera gana. Así, **puedes acceder a cualquier ruta de la API directamente desde la barra del navegador** (ej. `http://localhost:3000/api/users/me` o `http://localhost:3000/api/articles`) y verás los datos de tu sesión actual, sin necesidad de usar Postman o headers personalizados.

El panel conserva el token en `localStorage`, mientras que la cookie es de sesión y puede
desaparecer al cerrar el navegador. Cuando el panel vuelve a consultar la API con un JWT
válido, el backend restaura la cookie si falta o pertenece a otra sesión. No renueva el JWT
ni prolonga su caducidad. Tras desplegar esta versión, recarga el panel antes de abrir un
endpoint en otra ventana del mismo perfil de navegador, usando el mismo host de la API.

En producción, el panel debe enviar `credentials: 'include'` (ya lo hace), su origen exacto
debe estar en `ALLOWED_ORIGINS` y nginx debe reenviar `X-Forwarded-Proto: https` cuando termine
TLS. Los dominios `https://admin.lamarjoyeria.mooo.com` y `https://api.lamarjoyeria.mooo.com`
permiten mantener `SameSite=Lax`; no es necesario compartir la cookie con todos los subdominios.
`localStorage` pertenece al origen del panel y no se envía automáticamente al navegar a la API.

### Artículos

| Método | Ruta | Auth | Descripción |
| ------ | ---- | :--: | ----------- |
| GET | `/articles` | sí | Activos. Un admin ve todos; un usuario solo los suyos |
| POST | `/articles` | sí | Crea. Se asigna al usuario autenticado |
| PUT | `/articles/:id` | sí | Edita (parcial, p. ej. `{ "published": true }`) |
| DELETE | `/articles/:id` | sí | Manda a la papelera y despublica |
| GET | `/articles/deleted` | sí | Papelera (30 días) |
| POST | `/articles/:id/restore` | sí | Restaura como borrador |
| DELETE | `/articles/:id/permanent` | sí | Borrado definitivo |
| GET | `/public/articles` | no | Publicados, para el sitio público |

### Usuarios (solo admins, salvo `/users/me`)

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| GET | `/users` | Lista todos (sin contraseñas), con `isAdmin` calculado |
| GET | `/users/:id` | Un usuario por id |
| PUT | `/users/:id` | Edita `name`, `email`, `role` |
| DELETE | `/users/:id` | Elimina al usuario **y todas sus publicaciones** (con sus fotos del bucket) |
| POST | `/users/:id/change-password` | `{ password }` (mín. 8) |

Un admin no puede quitarse su propio rol ni eliminar su propia cuenta.

## Reglas clave

- **Roles:** un usuario es admin si su correo está en `ADMIN_EMAILS` (`src/models/user.js`) o si tiene `role: 'admin'`. El método `user.isAdmin()` es la referencia autoritativa.
- **Registro:** las cuentas se crean por API (`/signup` o `/signup`); nacen como `'user'` salvo que su correo esté en `ADMIN_EMAILS`. Contraseñas siempre con hash bcrypt; nunca salen en ninguna respuesta.
- **Visibilidad por dueño:** en `/articles` el filtro está en el controlador; un usuario normal no puede ver ni tocar artículos de otros (responden `404`).
- **Errores:** todos se registran en `logs/error.log` (los 4xx como `warn`, los 5xx como `error`), con método, ruta, estado y cuerpo (contraseñas enmascaradas). `logs/request.log` guarda todo lo demás.

## Fotos

- `multipart/form-data` en el campo `image` (JPG, PNG, WebP, GIF; máx. 20 MB). Se comprueba el contenido real del archivo.
- El servidor las convierte a WebP (calidad 80, máx. 1600 px, sin metadatos) y las sube al bucket de GCS.
- Para quitar la foto sin poner otra: `removeImage=true`.
- `npm run images:check` diagnostica sharp y el bucket; `npm run images:optimize` reoptimiza las fotos ya subidas.

## Comandos

```bash
npm run dev              # desarrollo
npm start                # producción (PM2)
npm run seed:admin       # utilidad: crear admin / restablecer contraseña
npm run cleanup           # limpiar BD: User daralibatista@gmail.com se conserva, todo lo demás se borra
npm run lint             # ESLint
```

## Despliegue

- `.env` de producción: `NODE_ENV=production`, `JWT_SECRET` de 32+ caracteres, `ALLOWED_ORIGINS` con el dominio del panel.
- nginx como proxy inverso con `client_max_body_size 25m;`, SSL con Certbot, PM2 (`pm2 start ecosystem.config.js`).
- Instalar dependencias en el servidor con `npm ci --omit=dev`.
- Sin `GCS_BUCKET_NAME` todo funciona salvo la subida de fotos (503).

## Auditoría de despliegue

Ver [DEPLOY_GOOGLE_CLOUD.md](DEPLOY_GOOGLE_CLOUD.md). `npm run test:integration` ejecuta HTTP y MongoDB aislado (requiere mongod), sin tocar la base configurada en .env.
