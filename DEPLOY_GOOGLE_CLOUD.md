# Despliegue conjunto en Google Cloud

Esta preparación corresponde a una VM de Compute Engine con nginx, PM2 y un dominio HTTPS. No es una configuración de Cloud Run: la purga periódica actual necesita un proceso persistente. No se ha desplegado ni modificado ningún recurso de Google Cloud durante esta auditoría.

## Backend

1. Instalar Node.js 22.12 o posterior y ejecutar `npm ci` en el repositorio del backend. Las pruebas de esta auditoría se ejecutaron con Node.js 26.5.0; conviene repetirlas con la versión elegida para el servidor.
2. Crear `.env` a partir de `.env.example`. Configurar `NODE_ENV=production`, `MONGODB_URI`, un `JWT_SECRET` aleatorio y `ALLOWED_ORIGINS=https://admin.example.com`. Para generar un secreto: `openssl rand -hex 32`.
3. Mantener `HOST=127.0.0.1`, `PORT=3000` y `TRUST_PROXY=loopback` si nginx se ejecuta en la misma VM. Si hay otro proxy delante, adaptar las redes de confianza a esa topología; no confiar en cualquier remitente.
4. Configurar `TRASH_RETENTION_DAYS` entre 1 y 365 y `JWT_EXPIRES_IN` (por ejemplo, `12h`). El panel consulta `/api/config` para mostrar el plazo real.
5. Crear el administrador inicial con `ADMIN_EMAIL`, `ADMIN_NAME` y una contraseña propia en `ADMIN_PASSWORD`, y ejecutar `npm run seed:admin`. Este comando puede restablecer una cuenta existente: usarlo deliberadamente. El registro público no permite tomar direcciones reservadas en `ADMIN_EMAILS`; los administradores pueden crear cuentas mediante `POST /api/users`.
6. Ejecutar `npm run lint` y `npm test`. Para las pruebas completas, instalar `mongod` y ejecutar `npm run test:integration`: crean su propia base temporal y no usan la URI de producción.
7. Arrancar con `pm2 start ecosystem.config.js`, guardar la configuración con `pm2 save` y configurar el arranque de PM2 para el usuario del servicio. `/api/health` devuelve 200 con MongoDB disponible y 503 si la conexión cae.

MongoDB debe estar accesible solo desde el backend, con las credenciales y reglas de red apropiadas. No publicar los puertos 3000 ni 27017 de la VM; nginx recibe el tráfico HTTPS.

## Imágenes en Cloud Storage

Configurar `GCS_BUCKET_NAME` y, si es necesario, `GCS_PROJECT_ID`. En Compute Engine, usar una cuenta de servicio adjunta a la VM con permisos para crear y borrar objetos del bucket y el alcance de acceso adecuado. La librería usa Application Default Credentials; no hace falta copiar una clave privada a la VM.

Las URL de imágenes del proyecto son públicas (`storage.googleapis.com/...`). El bucket de imágenes debe permitir la lectura pública de esos objetos; no almacenar secretos allí. Si una política de la organización prohíbe acceso público, esta arquitectura necesita un servicio de imágenes o URLs firmadas antes de desplegar. La prueba local convierte imágenes con sharp, pero sustituye el bucket por uno en memoria: los permisos y la lectura pública del bucket real quedan por validar en Google Cloud.

## Panel y nginx

1. Configurar `VITE_API_URL=/api` y ejecutar `npm ci`, `npm test -- --run`, `npm run lint` y `npm run build`.
2. Publicar `dist/` como contenido estático. `VITE_API_URL` se incorpora al compilar: cambiarla requiere volver a generar el build. No colocar secretos en variables `VITE_`.
3. Adaptar `deploy/nginx.conf.example` del repositorio de administración con el dominio, la ubicación de `dist/` y los certificados existentes. La plantilla envía `/api/` a Node y devuelve `index.html` al abrir rutas internas del panel.
4. Validar en la VM con `sudo nginx -t` antes de recargar nginx. La plantilla no se validó con nginx local porque no está instalado en este entorno.
5. Si se usa un dominio API separado, compilar con `VITE_API_URL=https://api.example.com/api` y añadir el origen exacto del panel a `ALLOWED_ORIGINS`.

## Comprobación después del despliegue

- Abrir `/`, `/signin`, `/signup` y una URL privada directamente; sin sesión debe aparecer el formulario en `/` al intentar acceder a una ruta privada.
- Registrar una cuenta normal, iniciar sesión, recargar, cerrar la pestaña y volver; la sesión persiste hasta que el JWT caduque. Cerrar sesión debe volver a `/`.
- Crear un usuario desde una cuenta admin y confirmar que sigue abierta la sesión del admin.
- Crear un artículo con imagen, editarlo, publicarlo, moverlo a papelera, restaurarlo y borrarlo definitivamente.
- Confirmar que usuarios normales solo ven sus artículos y no pueden gestionar usuarios; comprobar también esos rechazos a través de la API.
- Consultar `/api/config` desde el origen del panel y confirmar que texto y cuenta regresiva usan ese valor.
- Comprobar el bucket real, HTTPS, registros de PM2/nginx y `/api/health`.

## Referencias oficiales

- [Express detrás de proxies](https://expressjs.com/en/guide/behind-proxies/)
- [Credenciales predeterminadas de Google Cloud](https://docs.cloud.google.com/docs/authentication/application-default-credentials)
- [Autenticación de Cloud Storage](https://docs.cloud.google.com/storage/docs/authentication)
- [Variables de entorno en Vite](https://vite.dev/guide/env-and-mode)
- [Despliegue estático con Vite](https://vite.dev/guide/static-deploy)
