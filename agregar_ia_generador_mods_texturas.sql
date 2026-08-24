-- =============================================================
--  agregar_ia_generador_mods_texturas.sql
--  -----------------------------------------------------------
--  Soporte para el "Generador IA" del panel admin (busca mods y
--  packs de texturas reales en CurseForge y los agrega como
--  PENDIENTES de revisión, nunca publicados directamente).
--
--  Qué agrega:
--   1) Columna "estado" ('publicado' | 'pendiente') en mods y
--      texturas. Todo lo que ya existe queda "publicado" (no
--      cambia nada de lo que ya tienes en el sitio). Lo que
--      inserta la función serverless queda "pendiente" hasta que
--      un admin lo aprueba desde el panel.
--   2) Columna "generado_ia" (boolean) para poder distinguir en
--      el futuro qué se agregó a mano y qué agregó la IA.
--   3) Índice único sobre curseforge_url (además del que ya
--      existe sobre el nombre) para que la IA nunca pueda
--      insertar dos veces el mismo mod aunque cambie de nombre.
--   4) Actualiza las políticas de LECTURA pública: los visitantes
--      normales solo ven "publicado"; los administradores (según
--      la función es_admin() de agregar_tabla_admins.sql) siguen
--      viendo todo, incluidos los pendientes, para poder
--      revisarlos.
--
--  REQUISITOS: correr DESPUÉS de db_schema_admin.sql,
--  agregar_tabla_admins.sql y
--  agregar_validacion_duplicados_mods_texturas.sql.
--
--  CÓMO SE APLICA:
--    Supabase > SQL Editor > pegar todo este archivo > Run.
--
--  IMPORTANTE SI YA TIENES DATOS CARGADOS CON CURSEFORGE_URL
--  REPETIDA (por ejemplo un mod y su versión "forge" separada
--  con el mismo link): el paso 3 va a fallar. Antes de correrlo,
--  revisa con:
--
--    select lower(curseforge_url), array_agg(nombre), count(*)
--    from mods group by lower(curseforge_url) having count(*) > 1;
--
--    select lower(curseforge_url), array_agg(nombre), count(*)
--    from texturas group by lower(curseforge_url) having count(*) > 1;
-- =============================================================

-- -------------------------------------------------------------
-- 1) y 2) Columnas nuevas
-- -------------------------------------------------------------
alter table mods
    add column if not exists estado text not null default 'publicado' check (estado in ('publicado', 'pendiente')),
    add column if not exists generado_ia boolean not null default false;

alter table texturas
    add column if not exists estado text not null default 'publicado' check (estado in ('publicado', 'pendiente')),
    add column if not exists generado_ia boolean not null default false;

-- -------------------------------------------------------------
-- 3) Duplicados también por link de CurseForge, no solo por nombre
-- -------------------------------------------------------------
create unique index if not exists idx_mods_curseforge_url_unico on mods (lower(curseforge_url));
create unique index if not exists idx_texturas_curseforge_url_unico on texturas (lower(curseforge_url));

create index if not exists idx_mods_estado on mods (estado);
create index if not exists idx_texturas_estado on texturas (estado);

-- -------------------------------------------------------------
-- 4) Lectura pública solo ve "publicado"; los admins ven todo.
--    Reemplaza la policy "using (true)" original de
--    db_schema_admin.sql.
-- -------------------------------------------------------------
drop policy if exists "lectura_publica_mods" on mods;
create policy "lectura_publica_mods" on mods
    for select
    using (estado = 'publicado' or es_admin(auth.jwt() ->> 'email'));

drop policy if exists "lectura_publica_texturas" on texturas;
create policy "lectura_publica_texturas" on texturas
    for select
    using (estado = 'publicado' or es_admin(auth.jwt() ->> 'email'));
