-- =============================================================
--  agregar_validacion_duplicados_mods_texturas.sql
--  -----------------------------------------------------------
--  Evita crear (o renombrar) un mod o una textura con el mismo
--  nombre que otro ya existente, sin importar mayúsculas o
--  minúsculas: "OptiFine", "optifine" y "OPTIFINE" cuentan como
--  el mismo nombre.
--
--  Esta validación vive en la base de datos a propósito (no
--  solo en el panel admin / JavaScript), por la misma razón que
--  el resto de las reglas de este proyecto: el navegador se
--  puede editar o saltear, Postgres no. Acá se resuelve con dos
--  capas que se complementan:
--
--   1) ÍNDICE ÚNICO case-insensitive sobre lower(nombre).
--      Es la garantía real y atómica: si dos solicitudes de
--      "crear mod" con el mismo nombre llegan al mismo tiempo
--      (dos pestañas, dos administradores, un script, etc.),
--      Postgres solo deja pasar una. La otra se rechaza en el
--      propio motor de base de datos, no depende de que el
--      navegador haya alcanzado a revisar nada antes.
--
--   2) TRIGGER que revisa duplicados ANTES de guardar y lanza
--      un mensaje claro en español ("Este mod ya existe en la
--      base de datos." / "Esta textura ya existe en la base de
--      datos.") en vez del error genérico de Postgres tipo
--      "duplicate key value violates unique constraint ...".
--      Sigue usando el mismo código de error (23505) que el
--      índice único, así que el panel admin puede mostrar el
--      mensaje correcto sin importar cuál de las dos capas fue
--      la que frenó el guardado.
--
--  Al editar un mod/textura y guardar sin cambiar su nombre, no
--  se marca como duplicado: la comparación excluye la propia
--  fila (columna "id") que se está actualizando.
--
--  CÓMO SE APLICA:
--    Supabase > SQL Editor > pegar todo este archivo > Run.
--    Se corre DESPUÉS de db_schema_admin.sql (necesita que las
--    tablas "mods" y "texturas" ya existan).
--
--  IMPORTANTE SI YA TIENES DATOS CARGADOS:
--    Si por error ya existen dos mods (o dos texturas) con el
--    mismo nombre en distintas mayúsculas/minúsculas, el paso
--    del índice único de más abajo va a fallar con un error de
--    "could not create unique index" y no se va a aplicar nada
--    de este script. Antes de correrlo, revisa si hay duplicados
--    con estas dos consultas y renombra o elimina los que sobren:
--
--      select lower(nombre), array_agg(nombre), count(*)
--      from mods group by lower(nombre) having count(*) > 1;
--
--      select lower(nombre), array_agg(nombre), count(*)
--      from texturas group by lower(nombre) having count(*) > 1;
-- =============================================================

-- -------------------------------------------------------------
-- 1) Índice único case-insensitive (la protección real / atómica)
-- -------------------------------------------------------------
create unique index if not exists idx_mods_nombre_unico on mods (lower(nombre));
create unique index if not exists idx_texturas_nombre_unico on texturas (lower(nombre));

-- -------------------------------------------------------------
-- 2) Trigger con mensaje claro en español
-- -------------------------------------------------------------
create or replace function fn_bloquear_nombre_duplicado()
returns trigger
language plpgsql
as $$
declare
    v_mensaje text;
    v_existe  boolean;
begin
    if TG_TABLE_NAME = 'mods' then
        v_mensaje := 'Este mod ya existe en la base de datos.';
    else
        v_mensaje := 'Esta textura ya existe en la base de datos.';
    end if;

    -- Se arma la consulta dinámicamente porque el mismo trigger sirve
    -- para "mods" y "texturas" (TG_TABLE_NAME cambia según la tabla
    -- donde esté instalado, nunca según algo que mande el navegador).
    -- La columna "id" excluye la propia fila: así, al editar un mod y
    -- guardarlo con su mismo nombre de siempre, no choca contra sí
    -- mismo.
    execute format(
        'select exists (select 1 from %I where lower(nombre) = lower($1) and id <> $2)',
        TG_TABLE_NAME
    )
    into v_existe
    using new.nombre, new.id;

    if v_existe then
        raise exception '%', v_mensaje using errcode = '23505';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_mods_nombre_duplicado on mods;
create trigger trg_mods_nombre_duplicado
    before insert or update of nombre on mods
    for each row execute function fn_bloquear_nombre_duplicado();

drop trigger if exists trg_texturas_nombre_duplicado on texturas;
create trigger trg_texturas_nombre_duplicado
    before insert or update of nombre on texturas
    for each row execute function fn_bloquear_nombre_duplicado();
