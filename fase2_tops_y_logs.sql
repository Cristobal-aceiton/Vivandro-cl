-- =============================================================
--  fase2_tops_y_logs.sql
--  -----------------------------------------------------------
--  FASE 2 del panel admin. Se corre DESPUÉS de db_schema_admin.sql,
--  mejoras_seguridad_backend.sql y agregar_tabla_admins.sql (usa
--  la función es_admin() que crea este último).
--
--  Agrega:
--   1) Permiso para que un admin pueda vaciar el historial de
--      "Intentos de acceso rechazados" (antes solo se podía leer,
--      nunca borrar).
--   2) Tabla "tops" -> qué mod/textura ocupa cada posición (1 a 5)
--      de cada uno de los 3 Tops del sitio público (tops.html),
--      gestionable desde la nueva sección "Tops" del panel admin.
--
--  CÓMO SE APLICA: Supabase > SQL Editor > pegar todo > Run.
-- =============================================================

-- -------------------------------------------------------------
-- 1) Vaciar historial de intentos de acceso rechazados
-- -------------------------------------------------------------
drop policy if exists "admin_borra_intentos" on intentos_acceso;
create policy "admin_borra_intentos" on intentos_acceso
    for delete
    using (es_admin(auth.jwt() ->> 'email'));

-- -------------------------------------------------------------
-- 2) Gestión dinámica de Tops
-- -------------------------------------------------------------
create table if not exists tops (
    id             bigint generated always as identity primary key,
    top_tipo       text not null check (top_tipo in ('texturas_pvp', 'mods_pvp', 'texturas_survival')),
    posicion       smallint not null check (posicion between 1 and 5),
    item_tabla     text not null check (item_tabla in ('mods', 'texturas')),
    item_id        uuid not null,
    actualizado_en timestamptz not null default now(),
    unique (top_tipo, posicion)
);

alter table tops enable row level security;

-- Cualquiera puede leer los Tops (se muestran en tops.html), pero
-- solo un admin puede crear, editar o eliminar filas.
drop policy if exists "cualquiera_lee_tops" on tops;
create policy "cualquiera_lee_tops" on tops
    for select
    using (true);

drop policy if exists "admin_escribe_tops" on tops;
create policy "admin_escribe_tops" on tops
    for all
    using (es_admin(auth.jwt() ->> 'email'))
    with check (es_admin(auth.jwt() ->> 'email'));

-- Cada Top solo acepta el tipo de ítem que le corresponde (el Top
-- de mods para PVP solo acepta mods; los otros dos solo texturas),
-- y el ítem elegido tiene que existir de verdad en esa tabla — no
-- se puede simplemente escribir cualquier UUID a mano ni con un
-- script, esto lo aplica Postgres, no el navegador.
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
    v_tabla_esperada := case when new.top_tipo = 'mods_pvp' then 'mods' else 'texturas' end;

    if new.item_tabla <> v_tabla_esperada then
        raise exception 'Este Top solo acepta ítems de "%"', v_tabla_esperada;
    end if;

    if new.item_tabla = 'mods' then
        select exists(select 1 from mods where id = new.item_id) into v_existe;
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

drop trigger if exists trg_validar_top on tops;
create trigger trg_validar_top before insert or update on tops
    for each row execute function fn_validar_top();

-- Si un mod/textura se elimina, o deja de estar publicado (pasa a
-- "pendiente" o "rechazado"), se saca automáticamente de cualquier
-- Top donde estuviera puesto — así nunca queda un Top público
-- mostrando algo que ya no existe o que todavía no debería verse.
create or replace function fn_sincronizar_tops_con_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if TG_OP = 'DELETE' then
        delete from tops where item_tabla = TG_TABLE_NAME::text and item_id = old.id;
        return old;
    elsif TG_OP = 'UPDATE' and new.estado is distinct from 'publicado' then
        delete from tops where item_tabla = TG_TABLE_NAME::text and item_id = new.id;
        return new;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_sync_tops_mods on mods;
create trigger trg_sync_tops_mods after update or delete on mods
    for each row execute function fn_sincronizar_tops_con_item();

drop trigger if exists trg_sync_tops_texturas on texturas;
create trigger trg_sync_tops_texturas after update or delete on texturas
    for each row execute function fn_sincronizar_tops_con_item();

create index if not exists idx_tops_tipo on tops (top_tipo, posicion);
