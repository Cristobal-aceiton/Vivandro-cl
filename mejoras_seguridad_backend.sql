-- =============================================================
--  mejoras_seguridad_backend.sql
--  -----------------------------------------------------------
--  Se corre DESPUÉS de db_schema_admin.sql y crear_tabla_descargas.sql
--  (necesita que las tablas servidores, mods, texturas y descargas
--  ya existan).
--
--  Agrega:
--   1) admin_log        -> bitácora automática de todo lo que se
--                          crea/edita/elimina en el panel, y quién
--                          lo hizo (por trigger, no depende del
--                          código del navegador).
--   2) intentos_acceso  -> registro de logins con Google que NO son
--                          el admin (para detectar accesos raros).
--   3) registrar_descarga() -> reemplaza el INSERT abierto a la
--                          tabla "descargas" por una función que
--                          valida el item y limita la frecuencia,
--                          para que no se pueda inflar a mano ni
--                          con un script.
--   4) purgar_descargas_antiguas() -> opcional, para no acumular
--                          filas de descargas para siempre.
--
--  CÓMO SE APLICA: Supabase > SQL Editor > pegar todo > Run.
-- =============================================================

-- -------------------------------------------------------------
-- 1) Bitácora de acciones del admin (auditoría)
-- -------------------------------------------------------------
create table if not exists admin_log (
    id          bigint generated always as identity primary key,
    admin_email text not null,
    accion      text not null check (accion in ('crear', 'actualizar', 'eliminar')),
    tabla       text not null,
    item_id     uuid,
    detalle     jsonb,
    creado_en   timestamptz not null default now()
);

alter table admin_log enable row level security;

drop policy if exists "admin_lee_log" on admin_log;
create policy "admin_lee_log" on admin_log
    for select
    using (auth.jwt() ->> 'email' = 'cristobalaceiton4@gmail.com');

-- Nadie inserta directo a esta tabla (ni el propio admin): solo la
-- escribe el trigger de abajo, que corre con privilegios de
-- servidor (security definer) y por lo tanto no se puede saltar
-- editando el JavaScript del sitio.

create or replace function fn_log_admin_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email text := auth.jwt() ->> 'email';
begin
    if TG_OP = 'DELETE' then
        insert into admin_log (admin_email, accion, tabla, item_id, detalle)
        values (v_email, 'eliminar', TG_TABLE_NAME, old.id, to_jsonb(old));
        return old;
    elsif TG_OP = 'UPDATE' then
        insert into admin_log (admin_email, accion, tabla, item_id, detalle)
        values (v_email, 'actualizar', TG_TABLE_NAME, new.id,
                jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new)));
        return new;
    elsif TG_OP = 'INSERT' then
        insert into admin_log (admin_email, accion, tabla, item_id, detalle)
        values (v_email, 'crear', TG_TABLE_NAME, new.id, to_jsonb(new));
        return new;
    end if;
    return null;
end;
$$;

drop trigger if exists trg_log_servidores on servidores;
create trigger trg_log_servidores after insert or update or delete on servidores
    for each row execute function fn_log_admin_action();

drop trigger if exists trg_log_mods on mods;
create trigger trg_log_mods after insert or update or delete on mods
    for each row execute function fn_log_admin_action();

drop trigger if exists trg_log_texturas on texturas;
create trigger trg_log_texturas after insert or update or delete on texturas
    for each row execute function fn_log_admin_action();

create index if not exists idx_admin_log_fecha on admin_log (creado_en desc);

-- -------------------------------------------------------------
-- 2) Intentos de acceso denegados al panel
-- -------------------------------------------------------------
create table if not exists intentos_acceso (
    id         bigint generated always as identity primary key,
    email      text not null,
    creado_en  timestamptz not null default now()
);

alter table intentos_acceso enable row level security;

-- Cada persona logueada con Google solo puede insertar SU PROPIO
-- intento (auth.jwt() ->> 'email' debe coincidir con la columna
-- "email"), así nadie puede insertar registros a nombre de otro.
drop policy if exists "insertar_intento_propio" on intentos_acceso;
create policy "insertar_intento_propio" on intentos_acceso
    for insert
    with check (auth.jwt() ->> 'email' = email);

drop policy if exists "admin_lee_intentos" on intentos_acceso;
create policy "admin_lee_intentos" on intentos_acceso
    for select
    using (auth.jwt() ->> 'email' = 'cristobalaceiton4@gmail.com');

create index if not exists idx_intentos_fecha on intentos_acceso (creado_en desc);

-- -------------------------------------------------------------
-- 3) Registro seguro de descargas (reemplaza el INSERT abierto)
-- -------------------------------------------------------------

-- Ya no se permite insertar directo a "descargas" desde el
-- navegador: solo a través de esta función, que valida que el
-- item exista de verdad y descarta clicks repetidos en menos de
-- 2 segundos (evita spam accidental o con un script).
create or replace function registrar_descarga(p_tipo text, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_existe   boolean;
    v_reciente int;
begin
    if p_tipo not in ('mods', 'texturas') then
        raise exception 'tipo invalido';
    end if;

    if p_item_id is null then
        raise exception 'item_id requerido';
    end if;

    if p_tipo = 'mods' then
        select exists(select 1 from mods where id = p_item_id) into v_existe;
    else
        select exists(select 1 from texturas where id = p_item_id) into v_existe;
    end if;

    if not v_existe then
        raise exception 'item no encontrado';
    end if;

    select count(*) into v_reciente
    from descargas
    where item_id = p_item_id
      and creado_en > now() - interval '2 seconds';

    if v_reciente > 0 then
        return; -- ignora en silencio, no rompe la descarga del usuario
    end if;

    insert into descargas (tipo, item_id) values (p_tipo, p_item_id);
end;
$$;

grant execute on function registrar_descarga(text, uuid) to anon, authenticated;

-- Cierra la puerta vieja: ya no se puede insertar directo a la
-- tabla (ni siquiera con las claves públicas), solo vía la función.
drop policy if exists "insertar_descarga_publica" on descargas;
revoke insert on descargas from anon, authenticated;

create index if not exists idx_descargas_item_fecha on descargas (item_id, creado_en desc);

-- -------------------------------------------------------------
-- 4) (Opcional) Purga automática de descargas viejas
-- -------------------------------------------------------------
-- Requiere la extensión "pg_cron", disponible en la mayoría de
-- los proyectos Supabase (Database > Extensions > pg_cron).
-- Si no la tienes disponible, omite este bloque: no es necesario
-- para que funcione el resto.

create or replace function purgar_descargas_antiguas()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from descargas where creado_en < now() - interval '18 months';
end;
$$;

-- Descomenta estas 2 líneas solo si activaste la extensión pg_cron:
-- create extension if not exists pg_cron;
-- select cron.schedule('purga_descargas_mensual', '0 5 1 * *', $$select purgar_descargas_antiguas();$$);
