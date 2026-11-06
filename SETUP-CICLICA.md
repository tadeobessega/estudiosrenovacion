# Cíclica — puesta en marcha (Supabase)

El CMS de Cíclica corre sobre **Supabase** (base Postgres + almacenamiento de archivos).
El resto del sitio no cambia: sigue siendo estático en GitHub Pages y los informes /
miembros siguen con el Apps Script de siempre.

## 1. Crear el proyecto

1. Entrá a <https://supabase.com> → **New project**.
2. Plan **Free**. Región: **South America (São Paulo)**.
3. Guardá la contraseña de la base (no se usa en el sitio, pero conviene tenerla).

## 2. Pasarme las llaves

En **Project Settings → API**:

- **Project URL** — `https://xxxxxxxxxxxx.supabase.co`
- **anon `public`** — el token largo que empieza con `eyJ…`

> La `anon` key es pública a propósito: va en `assets/js/ciclica-data.js`. La seguridad
> la hacen las *policies* (RLS) del script de abajo. **No** pasar nunca la `service_role`.

Yo las pego en `assets/js/ciclica-data.js` (constantes `SUPABASE_URL` y `SUPABASE_ANON`
arriba de todo).

## 3. Correr el SQL

Supabase → **SQL Editor → New query** → pegar todo el contenido de
[`supabase/schema.sql`](supabase/schema.sql) → **Run**.

Crea:
- tabla `notas` (título, subtítulo, bajada, cuerpo HTML, autor, email, centros,
  imagen, estado borrador/en_edicion/publicada, destacada, fecha)
- las reglas de acceso (público lee sólo publicadas y sólo puede *enviar* borradores;
  la redacción logueada hace todo)
- dos buckets de archivos: `notas-img` (público) y `notas-docs` (privado, los Word)

Es idempotente: se puede volver a correr sin romper nada.

## 4. Crear los usuarios de la redacción

Supabase → **Authentication → Users → Add user** (uno por cada persona que edita):
- Email + contraseña.
- Marcar **Auto Confirm User**.

Con eso entran a `admin/ciclica.html`.

## 5. Listo

- **Público:** `pages/ciclica.html` — hero, *Destacadas*, *Últimas publicadas*,
  filtros por autor y por centro. El botón "Enviá tu nota" abre el formulario:
  título, resumen, autor, **email (obligatorio)**, centros y el **Word (.docx)**.
  Eso crea un borrador y sube el Word al bucket privado.
- **Redacción:** `admin/ciclica.html` — login con el usuario de Supabase. Lista de
  borradores / en edición / publicadas. Al abrir una nota: campos de título,
  subtítulo, bajada, autor, email, centros, fecha e imagen destacada, más un editor
  de texto (negrita, cursiva, intertítulos, listas, cita, imágenes). Botón
  **"Importar desde Word"** (convierte el .docx a texto formateado, subiendo las
  imágenes que traiga) y **"Traer del Word enviado"** para el archivo del autor.
  Botones **Guardar**, **Publicar / Despublicar**, **Destacar**, **Vista previa**.
- Cada nota publicada vive en `pages/nota.html?id=…` con su propio link para compartir.

## Nota sobre lo anterior

Las notas que estaban en la planilla de Google (tab *Notas*) no se migran solas.
Si hay alguna que quieras conservar, se vuelve a cargar desde el editor (son pocas).
El flujo viejo de "se envía → se aprueba y se publica igual" queda reemplazado por
"se envía una propuesta → la redacción la edita y recién ahí se publica".
