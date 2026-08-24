-- =============================================================
--  arreglo_admin_log_generador_ia.sql
--  -----------------------------------------------------------
--  Arregla un error del Generador IA:
--    "null value in column admin_email of relation admin_log
--     violates not-null constraint"
--
--  Causa: el trigger fn_log_admin_action() (creado en
--  mejoras_seguridad_backend.sql) saca el email de
--  auth.jwt() ->> 'email'. Eso funciona cuando el cambio lo
--  hace un admin logueado desde el navegador (sí hay JWT), pero
--  api/ia-generar.js inserta usando la SUPABASE_SERVICE_ROLE_KEY
--  (a propósito, para saltarse RLS), y con esa clave no hay
--  ningún usuario de sesión, así que auth.jwt() da null.
--
--  Arreglo: si no hay JWT (o sea, el insert vino del backend/
--  service role), se guarda la etiqueta 'generador-ia (backend)'
--  en vez de fallar. Los cambios hechos por un admin real desde
--  el panel se siguen registrando con su email normal, sin
--  ningún cambio de comportamiento ahí.
--
--  CÓMO SE APLICA: Supabase > SQL Editor > pegar todo > Run.
--  (Solo reemplaza la función; los triggers que ya existen
--  siguen apuntando a ella sin que haga falta recrearlos.)
-- =============================================================

create or replace function fn_log_admin_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email text := coalesce(auth.jwt() ->> 'email', 'generador-ia (backend)');
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
