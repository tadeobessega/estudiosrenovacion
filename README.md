# CER: Centros de Estudios Renovación

Sitio institucional de la red de centros y observatorios
(CEER, CEEIR, CEDHyS, OPSA, OPAL, OPER, CIREN). La revista *Cíclica* vive aparte,
en <https://ciclica.com.ar/> (el botón celeste del menú lleva ahí).

## Cómo funciona

Todo corre en **Cloudflare Workers** (plan gratuito):

| Pieza | Qué es | Dónde |
|---|---|---|
| Sitio | HTML/CSS/JS estático | `index.html`, `pages/`, `admin/`, `assets/` → se copia a `dist/` |
| API | Worker que lee y escribe la base | `worker/index.js` (rutas `/api` y `/files/*`) |
| Base | **D1** (SQLite): informes, miembros, usuarios, sesiones, config | `estudiosrenovacion-db` |
| PDF | **Workers KV**: los PDF que se suben desde el panel | `estudiosrenovacion-archivos` |

La configuración está en `wrangler.jsonc`. El esquema de la base está en
`worker/sql/schema.sql`; `worker/sql/seed.sql` tiene los datos que venían de la
planilla de Google y se cargan solos la primera vez que el Worker atiende `/api`.
Los informes viejos siguen apuntando a sus PDF en Drive; los nuevos quedan en KV
y se sirven desde `/files/...`.

```
index.html, pages/, admin/, assets/   Sitio
pages/monitor/                        Dashboard económico del CEER (bot en Python)
worker/index.js                       API + archivos
worker/sql/                           Esquema y datos iniciales
scripts/build.mjs                     Copia el sitio a dist/
wrangler.jsonc                        Config del Worker (D1, KV, assets)
```

## Deploy

Cloudflare (Workers Builds) está conectado al repo:

- **Build command:** `pnpm run build`
- **Deploy command:** `npx wrangler deploy`

Cada push a la rama de producción vuelve a publicar.

## Desarrollo local

```
pnpm install
pnpm run dev        # build + wrangler dev en http://localhost:8787
```

`wrangler dev` usa una base D1 local vacía: para probar, creá las tablas con
`npx wrangler d1 execute estudiosrenovacion-db --local --file worker/sql/schema.sql`.

## Panel de administración

`/admin/login.html`. Las contraseñas se guardan con PBKDF2 (nunca en texto plano)
y cada usuario puede cambiar la suya desde el ícono de llave. Los usuarios nuevos
se registran y un administrador los aprueba.

## Diseño

Tema cobalto con **modo oscuro y modo claro** (botón en el header; arranca según
la preferencia del sistema y recuerda la elección). Todo el color está en tokens
CSS al principio de `assets/css/styles.css`; el espaciado usa una sola escala
(`--section-y`, `--section-head`, `--grid-gap`, `--card-pad`).
