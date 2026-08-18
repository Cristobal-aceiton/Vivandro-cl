-- =============================================================
--  agregar_tabla_admins.sql
--  -----------------------------------------------------------
--  Reemplaza los emails de administrador hardcodeados en las
--  políticas RLS (db_schema_admin.sql, crear_tabla_descargas.sql,
--  mejoras_seguridad_backend.sql, agregar_segundo_admin.sql) por
--  una tabla "admins" que se administra desde el propio panel
--  (sección "Administradores"), sin volver a tocar SQL a mano
--  cada vez que hay que agregar o quitar a alguien.
--
--  Reglas:
--   - Cualquier fila en "admins" puede leer/crear/editar/eliminar
--     servidores, mods y texturas, y ver la bitácora y los
--     intentos de acceso rechazados.
--   - Solo un admin con es_superadmin = true puede agregar o
--     quitar administradores (autorizar_admins).
--
--  REQUISITOS: correr DESPUÉS de db_schema_admin.sql,
--  crear_tabla_descargas.sql y mejoras_seguridad_backend.sql.
--
--  CÓMO SE APLICA: Supabase > SQL Editor > pegar todo > Run.
--
--  IMPORTANTE: antes de correrlo, revisa el bloque "Semilla"
--  más abajo y ajusta los emails/es_superadmin a lo que
--  corresponda en tu caso (por defecto deja como superadmin
--  solo a la cuenta que ya estaba hardcodeada como admin único).
-- =============================================================

-- -------------------------------------------------------------
-- 1) Tabla de administradores autorizados
-- -------------------------------------------------------------
create table if not exists admins (
    email          text primary key,
    es_superadmin  boolean not null default false,
    creado_en      timestamptz not null default now()
);

alter table admins enable row level security;

-- -------------------------------------------------------------
-- 2) Funciones "security definer": consultan la tabla admins
--    saltándose su propia RLS. Se usan desde TODAS las políticas
--    (incluida la de la propia tabla admins) para no depender de
--    una subconsulta recursiva sobre una tabla protegida por RLS.
-- -------------------------------------------------------------
create or replace function es_admin(p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists(select 1 from admins where email = p_email);
$$;

create or replace function es_superadmin(p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists(select 1 from admins where email = p_email and es_superadmin = true);
$$;

grant execute on function es_admin(text) to anon, authenticated;
grant execute on function es_superadmin(text) to anon, authenticated;

-- -------------------------------------------------------------
-- 3) Políticas de la tabla admins
-- -------------------------------------------------------------
drop policy if exists "admin_lee_admins" on admins;
create policy "admin_lee_admins" on admins
    for select
    using (es_admin(auth.jwt() ->> 'email'));

drop policy if exists "superadmin_agrega_admins" on admins;
create policy "superadmin_agrega_admins" on admins
    for insert
    with check (es_superadmin(auth.jwt() ->> 'email'));

drop policy if exists "superadmin_quita_admins" on admins;
create policy "superadmin_quita_admins" on admins
    for delete
    using (es_superadmin(auth.jwt() ->> 'email'));

-- -------------------------------------------------------------
-- 4) Semilla: los administradores que ya estaban hardcodeados.
--    Ajusta esto si quieres otra configuración inicial. Correrlo
--    de nuevo no duplica filas (on conflict do nothing).
-- -------------------------------------------------------------
insert into admins (email, es_superadmin) values
    ('cristobalaceiton4@gmail.com', true),
    ('e7440514@gmail.com', false)
on conflict (email) do nothing;

-- -------------------------------------------------------------
-- 5) Actualiza las políticas de todo lo demás para que revisen
--    la tabla admins en vez de un email fijo.
-- -------------------------------------------------------------

-- servidores / mods / texturas (db_schema_admin.sql)
drop policy if exists "admin_write_servidores" on servidores;
create policy "admin_write_servidores" on servidores
    for all
    using (es_admin(auth.jwt() ->> 'email'))
    with check (es_admin(auth.jwt() ->> 'email'));

drop policy if exists "admin_write_mods" on mods;
create policy "admin_write_mods" on mods
    for all
    using (es_admin(auth.jwt() ->> 'email'))
    with check (es_admin(auth.jwt() ->> 'email'));

drop policy if exists "admin_write_texturas" on texturas;
create policy "admin_write_texturas" on texturas
    for all
    using (es_admin(auth.jwt() ->> 'email'))
    with check (es_admin(auth.jwt() ->> 'email'));

-- descargas (crear_tabla_descargas.sql)
drop policy if exists "admin_lee_descargas" on descargas;
create policy "admin_lee_descargas" on descargas
    for select
    using (es_admin(auth.jwt() ->> 'email'));

drop policy if exists "admin_borra_descargas" on descargas;
create policy "admin_borra_descargas" on descargas
    for delete
    using (es_admin(auth.jwt() ->> 'email'));

-- admin_log / intentos_acceso (mejoras_seguridad_backend.sql)
drop policy if exists "admin_lee_log" on admin_log;
create policy "admin_lee_log" on admin_log
    for select
    using (es_admin(auth.jwt() ->> 'email'));

drop policy if exists "admin_lee_intentos" on intentos_acceso;
create policy "admin_lee_intentos" on intentos_acceso
    for select
    using (es_admin(auth.jwt() ->> 'email'));

create index if not exists idx_admins_email on admins (email);
