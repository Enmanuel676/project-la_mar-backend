# Añadir un administrador

Cómo crear una cuenta nueva para el panel de administración, o cambiar la contraseña de
una que ya existe.

## Antes de empezar: por qué no basta con Compass

Las contraseñas no se guardan en texto plano, sino como **hash de bcrypt**, un texto que
empieza por `$2b$10$...`. Al iniciar sesión, la API compara la contraseña escrita con ese
hash (`src/models/user.js`).

Por eso, si creas un documento en Compass y escribes la contraseña tal cual, esa cuenta
**nunca podrá iniciar sesión**: la API intenta compararla como si fuera un hash y siempre
falla. Compass no calcula hashes; hay que generarlos con alguna de las dos opciones de
abajo.

## Opción 1 (recomendada): el script `seed:admin`

Desde la carpeta `backend`:

```bash
ADMIN_EMAIL="nuevo@correo.com" ADMIN_PASSWORD="ContraseñaSegura" npm run seed:admin
```

Si todo va bien, verás:

```
Administrador listo: nuevo@correo.com
```

Cómo funciona:

- **Si el correo no existe**, crea la cuenta con la contraseña ya hasheada.
- **Si ya existe**, solo reemplaza su contraseña por el hash nuevo. Sirve para cambiar
  una contraseña y también para arreglar una cuenta que se creó a mano en Compass.
- Aplica las validaciones del modelo: comprueba el formato del correo, lo guarda en
  minúsculas y sin espacios, y no deja repetirlo.
- Siempre pone `name: "Admin"`. Si quieres otro nombre, cámbialo después en Compass;
  ese campo sí se puede editar a mano.

Para añadir varias cuentas, repite el comando con otros valores.

> **Ten en cuenta:**
> - El script se conecta a la base de datos de `MONGODB_URI` en tu `.env`. Comprueba que
>   sea la misma que estás viendo en Compass.
> - Si no pasas `ADMIN_EMAIL` ni `ADMIN_PASSWORD`, usa los del `.env` y, si también están
>   vacíos, `admin@lamar.com` / `lamar2026`. Con `NODE_ENV=production` se niega a usar
>   esa contraseña por defecto.
> - La contraseña queda guardada en el historial de la terminal. Para evitarlo, empieza el
>   comando con un espacio (en zsh, siempre que tengas activada la opción
>   `HIST_IGNORE_SPACE`).

## Opción 2: generar el hash y pegarlo en Compass

1. Genera el hash desde la carpeta `backend`:

   ```bash
   node -e "require('bcrypt').hash(process.argv[1], 10).then(console.log)" "ContraseñaSegura"
   ```

   Devuelve algo como `$2b$10$Xy...`. Cópialo **completo**.

2. En Compass, abre la base `la_mar` y la colección `users`. Pulsa **Add Data → Insert
   Document** y pega:

   ```json
   {
     "email": "nuevo@correo.com",
     "name": "Admin",
     "password": "$2b$10$...pega aquí el hash completo..."
   }
   ```

   Para cambiar la contraseña de una cuenta existente, edita el documento y reemplaza
   solo el campo `password` por el hash nuevo.

3. Escribe el correo **en minúsculas y sin espacios**. Desde la API, Mongoose lo
   normaliza solo, pero Compass se salta esa normalización: con una mayúscula o un espacio
   de más, el login no encontraría la cuenta.

## Comprobar que la cuenta funciona

Con el servidor arrancado (`npm run dev`):

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"nuevo@correo.com","password":"ContraseñaSegura"}'
```

- Si responde `{ "token": "...", "user": { ... } }`, la cuenta funciona.
- Si responde un error de credenciales, revisa la sección siguiente.

También puedes probarla directamente iniciando sesión en el panel.

## Si el login falla

| Causa | Cómo se ve en Compass | Solución |
| ----- | --------------------- | -------- |
| Contraseña en texto plano | `password` no empieza por `$2b$` | Ejecuta el script de la opción 1 con ese correo |
| Correo con mayúsculas o espacios | `email` no está todo en minúsculas o tiene espacios | Corrígelo en Compass o borra el documento y créalo con el script |
| Hash incompleto | `password` es más corto de 60 caracteres | Genera el hash otra vez y pégalo completo |
| Otra base de datos | La cuenta no aparece en `la_mar` | Revisa `MONGODB_URI` en `.env` |

## Eliminar un administrador

No hay un script para esto. En Compass, abre la colección `users` y borra el documento
de esa cuenta. Si esa persona tenía la sesión abierta, su token sigue valiendo hasta que
caduque (`JWT_EXPIRES_IN`, 12 horas por defecto).
