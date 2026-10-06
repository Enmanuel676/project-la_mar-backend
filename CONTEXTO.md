# CONTEXTO — Léeme antes de escribir una sola línea de código

Este archivo es la entrada del directorio. Si eres una IA y te han pasado este
proyecto, lee esto entero y después sólo las carpetas que hagan falta para la
tarea concreta.

## Quién soy

- Estudiante de desarrollo web **full stack en TripleTen**, actualmente en el
  **proyecto final**.
- Hablo español. **Todo el código, los comentarios y las explicaciones van en
  español**, incluidos los mensajes de error que ve la persona usuaria.
- Los nombres de variables, funciones, archivos y rutas van en **inglés**, que es
  como me lo enseñaron en TripleTen. El español es para los comentarios y los
  textos de interfaz.

## Qué estoy construyendo

Una web **full stack para el negocio de joyería de mi madre**. Es mi proyecto
final, así que tiene que cumplir los criterios de TripleTen y a la vez servir de
verdad al negocio.

Detalles en [`proyecto-final/brief.md`](proyecto-final/brief.md).

## Regla principal para la IA

> **Escribe el código como yo lo aprendí, no como tú lo harías.**

Eso significa en concreto:

1. **Usa el stack que ya conozco.** Nada de introducir librerías nuevas sin
   preguntar. Mi stack está más abajo.
2. **Respeta mis patrones.** Están documentados carpeta por carpeta, con ejemplos
   sacados de código que yo mismo escribí. Si hay un patrón documentado, se usa
   ese.
3. **Comenta el porqué, no el qué.** Mis comentarios explican decisiones y
   trampas, no repiten lo que hace la línea. Mira los ejemplos.
4. **Si algo no está en este directorio, pregúntame** antes de inventar un
   patrón. Prefiero aprender a que me des código que no entiendo.
5. **Explícame lo que escribes.** Estoy estudiando: el objetivo es que yo pueda
   defender y mantener cada línea.

## Mi stack

### Frontend
- HTML semántico + CSS con **metodología BEM** (un archivo `.css` por bloque, en
  `blocks/`)
- JavaScript moderno (ES Modules, clases, `async/await`, `fetch`)
- **React** con Vite, componentes funcionales y hooks
- React Router, incluidas rutas protegidas
- Sin librerías de UI ni de estado: nada de Tailwind, Redux, MUI…

### Backend
- **Node.js + Express**
- **MongoDB** con **Mongoose**
- Autorización con **JWT** (`jsonwebtoken`) y **bcrypt** para las contraseñas
- Validación con **celebrate** (Joi) + `validator`
- Registros con **winston**
- ESLint con configuración **airbnb-base**

### Despliegue
- Servidor en la nube, **nginx** como proxy inverso, **PM2** como gestor de
  procesos, SSL con **Certbot**

## Cómo se usa este directorio

Cada carpeta hoja tiene un `README.md` con la misma estructura: concepto, mi
nomenclatura, patrón de código, comandos de terminal y errores que ya cometí.

**No le pases a la IA el directorio entero.** Pásale `CONTEXTO.md` más las dos o
tres carpetas que toquen. Ejemplos:

| Lo que voy a hacer | Qué le paso |
|---|---|
| Crear un endpoint nuevo | `CONTEXTO.md` + `backend/servidor-express/rutas-routers/` + `backend/validacion-celebrate/` + `backend/manejo-errores/` |
| Un formulario en React | `CONTEXTO.md` + `frontend/react/formularios-validacion/` + `frontend/react/hooks-personalizados/` |
| Maquetar una sección | `CONTEXTO.md` + `frontend/css/bem/` + `frontend/html-semantico/` |
| Desplegar | `CONTEXTO.md` + `backend/despliegue/` + `terminal/` |

El mapa completo está en [`INDICE.md`](INDICE.md).

## Estado del directorio

Todas las carpetas de tema están documentadas (✅) a partir de los resúmenes de
los sprints 1–19 y de mi código real (Project 19 y `web_project_around`).
Cuando un resumen de TripleTen y mi código no coinciden, **manda mi código**.

Queda pendiente `proyecto-final/` (brief y decisiones de la joyería) y la
sección **"Errores que ya cometí"** de muchas carpetas, que se irá llenando
durante el proyecto.
