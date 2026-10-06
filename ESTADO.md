# Estado del proyecto · La Mar

Última actualización: 2026-09-30. Fase actual: **1 (pruebas en local)**.

## Dónde me quedé

Backend **terminado** (pasos 1–10) y probado con un diagnóstico automático: 62 comprobaciones
correctas, 0 fallos. Lo que falta es probarlo con los dos frontends.

| Paso | Qué es | Estado |
| ---- | ------ | :----: |
| 1 | Limpiar y dejar dependencias del stack | hecho |
| 2 | Configuración: `env.js`, MongoDB, winston | hecho |
| 3 | Modelos `Article` y `User` (login con correo) | hecho |
| 4 | Login con JWT, middleware de auth, `seed:admin` | hecho |
| 5 | Validación con celebrate y validator | hecho |
| 6 | Fotos: multer + Google Cloud Storage | hecho (bucket real sin probar) |
| 7 | CRUD de artículos y papelera | hecho |
| 8 | `GET /api/public/articles` (sitio público) | hecho |
| 9 | Errores centralizados, `app.js`, `server.js`, purga de 30 días | hecho |
| 10 | README, `.env.example`, PM2, lint y diagnóstico | hecho |

## Pendiente por probar en los frontends (local)

1. **Panel de administración** (`project-la_mar-backend/frontend`), ya adaptado al backend
   - [ ] Iniciar sesión con `admin@lamar.com` / `lamar2026` (el panel ya usa el backend real).
   - [ ] Crear, editar, publicar/despublicar, eliminar, restaurar y borrar definitivamente.
   - [ ] Subir foto desde el explorador de archivos (necesita el bucket, ver abajo).
2. **Sitio público** (`project-la_mar-frontend`)
   - [ ] Abrir `/catalogo` y ver los artículos publicados desde el panel (un precio, con su moneda).
   - [ ] Comprobar los tres estados: cargando, sin artículos y error de conexión.
   - [ ] Comprobar que un artículo eliminado o en borrador no aparece.
3. **Google Cloud Storage** (lo dejé como está, sin configurar)
   - [ ] Bucket con lectura pública, cuenta de servicio y clave JSON fuera del repositorio.
   - [ ] Rellenar `GCS_BUCKET_NAME` y `GOOGLE_APPLICATION_CREDENTIALS` (ruta absoluta) en `.env`.
   - Mientras tanto, crear artículos **sin foto** funciona; con foto responde 503.

## Cómo arrancar todo en local

```bash
# 1. Backend (http://localhost:3000). Necesita MongoDB corriendo.
cd backend && npm run dev

# 2. Panel de administración (http://localhost:5173)
cd frontend && npm run dev

# 3. Sitio público (http://localhost:5174/project-la_mar-frontend/)
cd project-la_mar-frontend && npm run dev
```

El backend acepta los puertos 5173 y 5174 del panel (`ALLOWED_ORIGINS` en `.env`). Si Vite
asigna otro puerto, añádelo ahí y reinicia el backend.

## Rutas locales (ya las tengo, no hace falta pasarlas)

- Backend: `/Users/enmanuel/Otros Datos/Open-Souces Projects/Final Project/project-la_mar-backend/backend`
- Panel de administración: `/Users/enmanuel/Otros Datos/Open-Souces Projects/Final Project/project-la_mar-backend/frontend`
- Sitio público: `/Users/enmanuel/Otros Datos/Open-Souces Projects/Final Project/project-la_mar-frontend`

Dime qué falló o qué quieres ajustar en la prueba. Trabajo solo en local por ahora.

## Ya adaptado en los frontends

- Panel: `USE_MOCK = false`; los errores muestran solo el `message` del backend; un 401 en el
  login ya no dice "Sesión caducada" sino "Correo o contraseña incorrectos"; si el backend está
  apagado avisa con un mensaje claro; la papelera calcula bien los días con fechas ISO; el
  formulario sube la foto como archivo (`FormData`), con botón para quitarla, y el campo de URL
  de imagen se eliminó. Probado con el código real de `api.js` contra el backend: 17/17.
- Sitio público: `Catalog.jsx` lee `GET /api/public/articles` y muestra un solo precio.
  La dirección de la API sale de `VITE_API_URL` (por defecto `http://localhost:3000/api`).

## Después: fase 2 (servidor en Google Cloud)

- Variables de producción: `NODE_ENV=production`, `JWT_SECRET` de 32+ caracteres (el servidor
  lo exige), `ADMIN_PASSWORD` propia, `ALLOWED_ORIGINS` con el dominio del panel.
- nginx como proxy inverso, PM2 (`pm2 start ecosystem.config.js`), dominio/DNS y SSL con Certbot.
- Límite de intentos de login (`limit_req` en nginx) y rotación de logs (`pm2-logrotate`).
- Apuntar los frontends a la URL pública: `VITE_API_URL` en el sitio público y `API_BASE_URL`
  en el panel.
- Tu lista de comprobación antes de subir todo.

## Referencias

- `README.md`: endpoints, fotos, papelera, CORS, logs y comandos.
- `CONTEXTO.md`: tu stack y las reglas para trabajar con la IA.
