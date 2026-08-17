-- =============================================================
--  agregar_indices_busqueda.sql
--  -----------------------------------------------------------
--  Se corre DESPUÉS de db_schema_admin.sql (necesita que existan
--  las tablas servidores, mods y texturas).
--
--  datos.js hace dos tipos de consulta que hoy no tienen índice
--  de apoyo (revisado en Datos.listarPagina):
--
--   1) .ilike("nombre", `%texto%`)  en servidores, mods y texturas
--      -> Es un LIKE con comodín ADELANTE ('%texto%'), así que un
--         índice B-tree normal (como el que ya existe para "orden")
--         no sirve para acelerarlo. Se necesita un índice GIN con
--         la extensión pg_trgm (búsqueda por trigramas), que sí
--         acelera ILIKE con comodines en cualquier posición.
--
--   2) .contains("modalidades", [modalidad])  en servidores
--      -> "modalidades" es un array (text[]). Un índice GIN sobre
--         la columna acelera ese "contains" (equivalente a @>).
--
--  No se agregan índices para columnas que no se filtran ni se
--  ordenan en el código (por ejemplo "categoria" en mods/texturas
--  no se usa para filtrar todavía), para no crear índices que no
--  se van a usar.
--
--  CÓMO SE APLICA: Supabase > SQL Editor > pegar todo > Run.
--  Es seguro correrlo aunque ya tengas datos cargados.
-- =============================================================

create extension if not exists pg_trgm;

-- 1) Búsqueda por nombre (ILIKE '%texto%')
create index if not exists idx_servidores_nombre_trgm
    on servidores using gin (nombre gin_trgm_ops);

create index if not exists idx_mods_nombre_trgm
    on mods using gin (nombre gin_trgm_ops);

create index if not exists idx_texturas_nombre_trgm
    on texturas using gin (nombre gin_trgm_ops);

-- 2) Filtro por modalidad (contains sobre array)
create index if not exists idx_servidores_modalidades
    on servidores using gin (modalidades);
