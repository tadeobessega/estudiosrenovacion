# CER — Centro de Estudios Estratégicos Renovación

Sitio institucional del CER y su red de centros y observatorios
(CEER, CEEIR, CEDHyS, OPSA, OPAL, OPER, CIREN) + la revista *Cíclica*.

## Cómo funciona

Sitio **100 % estático** (HTML/CSS/JS) pensado para **GitHub Pages**.
Los datos (informes, miembros, notas, config) y el panel de administración
usan el **Web App de Google Apps Script** del equipo — la URL está en
`assets/js/data-source.js` (`CER_API`). El backend no vive en este repo.

```
index.html                 Portada
pages/                      Una página por centro + Cíclica + ¿Quiénes somos?
pages/monitor/             Dashboard económico del CEER (Chart.js) + bot de datos
admin/                      Panel de administración
assets/css/                 styles.css (diseño CER), observatorio.css, admin.css
assets/js/
  data-source.js            Cliente de datos (define CER_API y window.CERData)
  reports-public.js         Pinta informes / miembros en el sitio público
  admin-config.js           Llamadas del panel (login, alta/edición, subida de PDF)
  main.js                    Slider, menú, scroll
  indicadores.js             Tarjetas de indicadores del CEER (APIs del BCRA / datos.gob.ar)
.github/workflows/monitor-datos.yml   Actualiza a diario los datos del dashboard
```

## Ver el sitio localmente

> ⚠️ No abras los `.html` con doble clic (como `file://` el navegador bloquea las
> llamadas al Apps Script). Servilo por HTTP:

```
npx serve .
```
o
```
python -m http.server 8000
```
y abrí `http://localhost:8000`.

## Publicar (GitHub Pages)

Este repo es `tadeobessega.github.io` → GitHub Pages sirve lo que está en la
rama `main`, en `https://tadeobessega.github.io/`.

1. Mergeá esta rama a `main` (o subí estos archivos a `main`).
2. Settings → Pages → *Source: Deploy from a branch* → `main` / `/ (root)`.
3. En 1–2 min queda online.

El `.nojekyll` evita que GitHub procese el sitio con Jekyll.

## Diseño

Tema oscuro "cobalto profundo": fondo casi negro azulado, orbes de luz azul,
patrón de flechas. Todo el color está en tokens CSS (`--cer-*` en `styles.css`;
`admin.css` para el panel).

> **Logo provisional:** hasta tener un isotipo propio del CER se usa el logo del
> CEER (`assets/img/ceer-logo.png`).

## Dashboard del CEER (`pages/monitor/`)

Ver `pages/monitor/README.md`. El workflow `monitor-datos.yml` corre el bot y
commitea `datos_historicos.json` una vez por día (o a mano desde *Actions*).
