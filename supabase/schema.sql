-- ============================================================
--  Cíclica — esquema de base para el CMS de notas de opinión
--  Pegar TODO esto en:  Supabase → SQL Editor → New query → Run
--  Es idempotente: se puede correr más de una vez sin romper nada.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
--  Allowlist de la redacción
--  Sólo las cuentas cuyo email esté acá pueden editar/publicar.
--  Se administra desde el SQL editor o el Table editor del dashboard.
-- ------------------------------------------------------------
create table if not exists public.editores (
  email      text primary key,
  nombre     text,
  created_at timestamptz not null default now()
);
alter table public.editores enable row level security;

drop policy if exists editores_self_read on public.editores;
create policy editores_self_read on public.editores
  for select to authenticated
  using (email = (auth.jwt() ->> 'email'));

create or replace function public.es_editor()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.editores where email = (auth.jwt() ->> 'email')
  );
$$;

-- >>> CARGAR ACÁ cada persona de la redacción <<<
insert into public.editores (email) values
  ('tadeobessega@gmail.com'),
  ('nicolasigalbornoz@gmail.com')
on conflict (email) do nothing;

-- ------------------------------------------------------------
--  Tabla de notas
-- ------------------------------------------------------------
create table if not exists public.notas (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  titulo            text not null,
  subtitulo         text,
  bajada            text,                         -- resumen: se ve en las tarjetas y como copete
  cuerpo_html       text,                         -- cuerpo formateado (HTML), lo arma la redacción

  autor             text not null,
  email_autor       text not null,                -- obligatorio
  centros           text[] not null default '{}', -- centros asociados: {'CEER','CEEIR',...}

  imagen_url        text,                         -- imagen destacada (URL pública en storage o externa)
  doc_url           text,                         -- ruta del Word original en el bucket privado 'notas-docs'

  estado            text not null default 'borrador'
                      check (estado in ('borrador','en_edicion','publicada','archivada')),
  destacada         boolean not null default false,
  fecha_publicacion date
);

create index if not exists notas_estado_fecha_idx
  on public.notas (estado, fecha_publicacion desc nulls last, created_at desc);
create index if not exists notas_centros_idx
  on public.notas using gin (centros);
create index if not exists notas_autor_idx
  on public.notas (autor);

-- updated_at automático
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists notas_touch_updated_at on public.notas;
create trigger notas_touch_updated_at
  before update on public.notas
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
--  Row Level Security de notas
-- ------------------------------------------------------------
alter table public.notas enable row level security;

-- Lectura pública: sólo notas publicadas
drop policy if exists notas_public_read on public.notas;
create policy notas_public_read on public.notas
  for select
  to anon
  using (estado = 'publicada');

-- Envío público desde el formulario: sólo borradores, sin destacar
drop policy if exists notas_public_submit on public.notas;
create policy notas_public_submit on public.notas
  for insert
  to anon
  with check (
    estado = 'borrador'
    and destacada = false
    and coalesce(titulo, '')      <> ''
    and coalesce(autor, '')       <> ''
    and coalesce(email_autor, '') <> ''
  );

-- Redacción (cuenta logueada Y en la allowlist): acceso total
drop policy if exists notas_editorial_all on public.notas;
create policy notas_editorial_all on public.notas
  for all
  to authenticated
  using (public.es_editor())
  with check (public.es_editor());

-- ------------------------------------------------------------
--  Storage: buckets de archivos
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notas-img', 'notas-img', true, 5242880,
        array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notas-docs', 'notas-docs', false, 10485760,
        array['application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/msword'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Políticas de storage
drop policy if exists notas_img_public_read on storage.objects;
create policy notas_img_public_read on storage.objects
  for select using (bucket_id = 'notas-img');

drop policy if exists notas_img_editorial_write on storage.objects;
create policy notas_img_editorial_write on storage.objects
  for insert to authenticated with check (bucket_id = 'notas-img' and public.es_editor());

drop policy if exists notas_img_editorial_update on storage.objects;
create policy notas_img_editorial_update on storage.objects
  for update to authenticated using (bucket_id = 'notas-img' and public.es_editor());

drop policy if exists notas_img_editorial_delete on storage.objects;
create policy notas_img_editorial_delete on storage.objects
  for delete to authenticated using (bucket_id = 'notas-img' and public.es_editor());

drop policy if exists notas_docs_public_submit on storage.objects;
create policy notas_docs_public_submit on storage.objects
  for insert to anon with check (bucket_id = 'notas-docs');

drop policy if exists notas_docs_editorial_read on storage.objects;
create policy notas_docs_editorial_read on storage.objects
  for select to authenticated using (bucket_id = 'notas-docs' and public.es_editor());

drop policy if exists notas_docs_editorial_delete on storage.objects;
create policy notas_docs_editorial_delete on storage.objects
  for delete to authenticated using (bucket_id = 'notas-docs' and public.es_editor());

-- ------------------------------------------------------------
--  Recomendado: en Authentication → Providers → Email,
--  desactivar "Enable sign-ups" (los editores se cargan a mano).
-- ------------------------------------------------------------
