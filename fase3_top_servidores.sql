-- =============================================================
--  fase3_top_servidores.sql
--  -----------------------------------------------------------
--  Agrega una 4ta categoría de Top: "Top Servidores" (además de
--  texturas_pvp, mods_pvp y texturas_survival que ya existían
--  desde fase2_tops_y_logs.sql).
--
--  Se corre DESPUÉS de fase2_tops_y_logs.sql.
--
--  CÓMO SE APLICA: Supabase > SQL Editor > pegar todo > Run.
-- =============================================================

-- -------------------------------------------------------------
-- 1) Ampliar los CHECK de la tabla "tops" para aceptar el nuevo tipo
-- -------------------------------------------------------------
alter table tops drop constraint if exists tops_top_tipo_check;
alter table tops add constraint tops_top_tipo_check
    check (top_tipo in ('texturas_pvp', 'mods_pvp', 'texturas_survival', 'servidores'));

alter table tops drop constraint if exists tops_item_tabla_check;
alter table tops add constraint tops_item_tabla_check
    check (item_tabla in ('mods', 'texturas', 'servidores'));

-- -------------------------------------------------------------
-- 2) La validación (fn_validar_top) ahora también acepta
--    top_tipo = 'servidores' -> item_tabla = 'servidores', y
--    comprueba que el servidor elegido exista de verdad.
-- -------------------------------------------------------------
create or replace function fn_validar_top()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tabla_esperada text;
    v_existe         boolean;
begin
    v_tabla_esperada := case
        when new.top_tipo = 'mods_pvp' then 'mods'
        when new.top_tipo = 'servidores' then 'servidores'
        else 'texturas'
    end;

    if new.item_tabla <> v_tabla_esperada then
        raise exception 'Este Top solo acepta ítems de "%"', v_tabla_esperada;
    end if;

    if new.item_tabla = 'mods' then
        select exists(select 1 from mods where id = new.item_id) into v_existe;
    elsif new.item_tabla = 'servidores' then
        select exists(select 1 from servidores where id = new.item_id) into v_existe;
    else
        select exists(select 1 from texturas where id = new.item_id) into v_existe;
    end if;

    if not v_existe then
        raise exception 'El ítem elegido no existe';
    end if;

    new.actualizado_en := now();
    return new;
end;
$$;

-- -------------------------------------------------------------
-- 3) Si un servidor se elimina, se saca automáticamente de
--    cualquier Top donde estuviera puesto. A diferencia de mods y
--    texturas, "servidores" no tiene columna "estado" (no pasa por
--    pendiente/publicado/rechazado), así que solo hace falta el
--    trigger de DELETE, no uno de UPDATE.
-- -------------------------------------------------------------
drop trigger if exists trg_sync_tops_servidores on servidores;
create trigger trg_sync_tops_servidores after delete on servidores
    for each row execute function fn_sincronizar_tops_con_item();
