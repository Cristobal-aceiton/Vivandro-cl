-- =============================================================
--  agregar_requisitos_mods.sql
--  -----------------------------------------------------------
--  Algunos mods necesitan otro mod instalado antes para
--  funcionar (una librería, un mod base, etc). Esta columna
--  guarda hasta 4 "requisitos": cada uno con un nombre y un
--  link a su página (normalmente CurseForge), para mostrarlos
--  en la tarjeta del mod como links celestes, separados del
--  botón naranja de "Descargar en CurseForge" del mod en sí.
--
--  Se guarda como JSONB: una lista de hasta 4 objetos
--  { "nombre": "...", "url": "..." }. Puede quedar vacía si el
--  mod no necesita nada más.
--
--  CÓMO SE APLICA:
--    Supabase > SQL Editor > pegar este archivo > Run.
--    Es seguro correrlo aunque ya tengas mods cargados: a todos
--    los existentes les queda una lista vacía por defecto.
-- =============================================================

alter table mods
    add column if not exists requisitos jsonb not null default '[]'::jsonb;

-- Valida en el propio servidor que nunca se guarden más de 4
-- requisitos ni que cada uno tenga más campos de los debidos,
-- aunque alguien intente escribir directo a la API sin pasar
-- por el panel admin.
alter table mods
    drop constraint if exists mods_requisitos_formato;
alter table mods
    add constraint mods_requisitos_formato check (
        jsonb_typeof(requisitos) = 'array'
        and jsonb_array_length(requisitos) <= 4
    );
