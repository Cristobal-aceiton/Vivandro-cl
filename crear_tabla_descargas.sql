-- =============================================================
--  crear_tabla_descargas.sql
--  -----------------------------------------------------------
--  Registra cada click en "Descargar en CurseForge" (mods y
--  texturas), para poder ver estadísticas en el panel admin.
--
--  Cualquiera (incluso sin login) puede INSERTAR una fila, o
--  sea "avisar que se hizo click en descargar" — no se guarda
--  ningún dato personal, solo qué se descargó y cuándo.
--  Solo el administrador puede LEER esos datos (para ver los
--  gráficos), de nuevo verificado server-side vía RLS.
-- =============================================================

create table if not exists descargas (
    id         bigint generated always as identity primary key,
    tipo       text not null check (tipo in ('mods', 'texturas')),
    item_id    uuid not null,
    creado_en  timestamptz not null default now()
);

alter table descargas enable row level security;

drop policy if exists "insertar_descarga_publica" on descargas;
create policy "insertar_descarga_publica" on descargas
    for insert
    with check (true);

drop policy if exists "admin_lee_descargas" on descargas;
create policy "admin_lee_descargas" on descargas
    for select
    using (auth.jwt() ->> 'email' = 'cristobalaceiton4@gmail.com');

drop policy if exists "admin_borra_descargas" on descargas;
create policy "admin_borra_descargas" on descargas
    for delete
    using (auth.jwt() ->> 'email' = 'cristobalaceiton4@gmail.com');

create index if not exists idx_descargas_tipo_item on descargas (tipo, item_id);
create index if not exists idx_descargas_fecha on descargas (creado_en);
