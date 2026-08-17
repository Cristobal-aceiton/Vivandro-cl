-- =============================================================
--  db_schema_admin.sql
--  -----------------------------------------------------------
--  Esquema para el panel de administración de Vivandro.
--  Crea las tablas de servidores, mods y texturas, y deja la
--  autorización de "quién puede escribir" resuelta 100% en el
--  servidor (Postgres/Supabase), no en el navegador.
--
--  CÓMO SE APLICA:
--    Supabase > SQL Editor > pegar todo este archivo > Run.
--
--  POR QUÉ ESTO SÍ ES SEGURO:
--    Row Level Security (RLS) se evalúa dentro de la base de
--    datos, usando el JWT que Supabase Auth ya validó del lado
--    del servidor cuando el usuario inició sesión con Google.
--    auth.jwt() ->> 'email' NO es un dato que el navegador pueda
--    falsificar: viene firmado por Supabase. Aunque alguien
--    edite el JavaScript del sitio o llame a la API directamente
--    con curl/Postman, Postgres va a rechazar el INSERT/UPDATE/
--    DELETE si el email del token no es el del administrador.
--    Por eso NO hace falta un backend Node/Express aparte: la
--    "capa server-side" es la propia base de datos.
-- =============================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------
-- Email autorizado como administrador. Se repite en cada policy
-- a propósito (Postgres no permite variables globales simples
-- en policies), así que si algún día cambia el correo admin,
-- hay que reemplazarlo en las 6 policies de "admin_write" de
-- abajo y volver a correr ese bloque.
-- -------------------------------------------------------------

create table if not exists servidores (
    id                 uuid primary key default gen_random_uuid(),
    nombre             text not null,
    descripcion        text not null default '',
    logo               text not null default '',
    ip                 text not null default '',
    -- "java" o "bedrock": le dice a la web qué endpoint de
    -- mcstatus.io consultar para saber si el servidor está
    -- online y cuántos jugadores tiene en tiempo real.
    tipo_edicion       text not null default 'java' check (tipo_edicion in ('java', 'bedrock')),
    jugadores_promedio text not null default '',
    anio_creacion      int,
    modalidades        text[] not null default '{}',
    orden              int not null default 0,
    creado_en          timestamptz not null default now(),
    actualizado_en     timestamptz not null default now()
);

create table if not exists mods (
    id                 uuid primary key default gen_random_uuid(),
    nombre             text not null,
    descripcion        text not null default '',
    imagen             text not null default '',
    curseforge_url     text not null,
    version_minecraft  text not null default '',
    categoria          text not null default '',
    orden              int not null default 0,
    creado_en          timestamptz not null default now(),
    actualizado_en     timestamptz not null default now()
);

create table if not exists texturas (
    id                 uuid primary key default gen_random_uuid(),
    nombre             text not null,
    descripcion        text not null default '',
    imagen             text not null default '',
    curseforge_url     text not null,
    version_minecraft  text not null default '',
    categoria          text not null default '',
    orden              int not null default 0,
    creado_en          timestamptz not null default now(),
    actualizado_en     timestamptz not null default now()
);

-- Mantiene actualizado_en al día en cada UPDATE, automáticamente.
create or replace function set_actualizado_en()
returns trigger as $$
begin
    new.actualizado_en = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_servidores_actualizado on servidores;
create trigger trg_servidores_actualizado before update on servidores
    for each row execute function set_actualizado_en();

drop trigger if exists trg_mods_actualizado on mods;
create trigger trg_mods_actualizado before update on mods
    for each row execute function set_actualizado_en();

drop trigger if exists trg_texturas_actualizado on texturas;
create trigger trg_texturas_actualizado before update on texturas
    for each row execute function set_actualizado_en();

-- -------------------------------------------------------------
-- Row Level Security: lectura pública, escritura solo admin.
-- -------------------------------------------------------------

alter table servidores enable row level security;
alter table mods       enable row level security;
alter table texturas   enable row level security;

drop policy if exists "lectura_publica_servidores" on servidores;
create policy "lectura_publica_servidores" on servidores
    for select using (true);

drop policy if exists "lectura_publica_mods" on mods;
create policy "lectura_publica_mods" on mods
    for select using (true);

drop policy if exists "lectura_publica_texturas" on texturas;
create policy "lectura_publica_texturas" on texturas
    for select using (true);

drop policy if exists "admin_write_servidores" on servidores;
create policy "admin_write_servidores" on servidores
    for all
    using (auth.jwt() ->> 'email' = 'cristobalaceiton4@gmail.com')
    with check (auth.jwt() ->> 'email' = 'cristobalaceiton4@gmail.com');

drop policy if exists "admin_write_mods" on mods;
create policy "admin_write_mods" on mods
    for all
    using (auth.jwt() ->> 'email' = 'cristobalaceiton4@gmail.com')
    with check (auth.jwt() ->> 'email' = 'cristobalaceiton4@gmail.com');

drop policy if exists "admin_write_texturas" on texturas;
create policy "admin_write_texturas" on texturas
    for all
    using (auth.jwt() ->> 'email' = 'cristobalaceiton4@gmail.com')
    with check (auth.jwt() ->> 'email' = 'cristobalaceiton4@gmail.com');

-- -------------------------------------------------------------
-- Índices de apoyo para orden/búsqueda.
-- -------------------------------------------------------------
create index if not exists idx_servidores_orden on servidores (orden);
create index if not exists idx_mods_orden on mods (orden);
create index if not exists idx_texturas_orden on texturas (orden);
