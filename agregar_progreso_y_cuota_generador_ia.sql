-- =============================================================
--  agregar_progreso_y_cuota_generador_ia.sql
--  -----------------------------------------------------------
--  Amplía el "Generador IA" del panel admin con:
--
--   1) ia_progreso: guarda el último índice de CurseForge
--      revisado, por tipo de contenido (mods/texturas) Y por la
--      combinación de filtros usada (categoría + palabra clave),
--      así cada nueva tanda sigue exactamente donde quedó la
--      anterior en vez de volver a empezar desde 0 y repetir
--      llamadas a la API ya gastadas.
--
--   2) ia_uso_diario + función ia_incrementar_uso(): cuenta
--      cuántas llamadas se hicieron HOY a CurseForge y a Groq,
--      para que el panel pueda mostrar "40 / 100 llamadas" y el
--      backend pueda impedir seguir generando cuando se alcanza
--      el límite diario configurado.
--
--  REQUISITOS: correr DESPUÉS de db_schema_admin.sql,
--  agregar_tabla_admins.sql y
--  agregar_ia_generador_mods_texturas.sql.
--
--  CÓMO SE APLICA:
--    Supabase > SQL Editor > pegar todo este archivo > Run.
-- =============================================================

-- -------------------------------------------------------------
-- 1) Progreso guardado del Generador IA
-- -------------------------------------------------------------
-- categoria_id: 0 significa "sin filtro de categoría" (no se usa
-- null a propósito, para que la restricción de unicidad de abajo
-- funcione: Postgres trata dos null como valores distintos, así
-- que con null el upsert por (tipo, categoria_id, busqueda) no
-- serviría para "recordar" la fila correcta).
-- busqueda: '' significa "sin palabra clave".
create table if not exists ia_progreso (
    id             uuid primary key default gen_random_uuid(),
    tipo           text not null check (tipo in ('mods', 'texturas')),
    categoria_id   int  not null default 0,
    busqueda       text not null default '',
    indice         int  not null default 0,
    actualizado_en timestamptz not null default now(),
    unique (tipo, categoria_id, busqueda)
);

create index if not exists idx_ia_progreso_tipo on ia_progreso (tipo);

alter table ia_progreso enable row level security;

-- Solo lectura para administradores (por si el panel algún día
-- quiere mostrar "vas en el índice 350 para esta categoría"); la
-- escritura la hace exclusivamente api/ia-generar.js con la
-- Service Role Key, que de todos modos se salta RLS.
drop policy if exists "admin_lee_ia_progreso" on ia_progreso;
create policy "admin_lee_ia_progreso" on ia_progreso
    for select
    using (es_admin(auth.jwt() ->> 'email'));

-- -------------------------------------------------------------
-- 2) Cuota diaria de llamadas (CurseForge / Groq)
-- -------------------------------------------------------------
create table if not exists ia_uso_diario (
    fecha    date not null,
    servicio text not null check (servicio in ('curseforge', 'groq')),
    llamadas int  not null default 0,
    primary key (fecha, servicio)
);

alter table ia_uso_diario enable row level security;

drop policy if exists "admin_lee_ia_uso_diario" on ia_uso_diario;
create policy "admin_lee_ia_uso_diario" on ia_uso_diario
    for select
    using (es_admin(auth.jwt() ->> 'email'));

-- Suma "p_cantidad" al contador de hoy para ese servicio de forma
-- atómica (INSERT ... ON CONFLICT DO UPDATE en una sola sentencia,
-- así dos llamadas casi simultáneas no se pisan) y devuelve el
-- total del día después de sumar.
create or replace function ia_incrementar_uso(p_servicio text, p_cantidad int default 1)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
    v_total int;
begin
    insert into ia_uso_diario (fecha, servicio, llamadas)
    values (current_date, p_servicio, p_cantidad)
    on conflict (fecha, servicio)
    do update set llamadas = ia_uso_diario.llamadas + excluded.llamadas
    returning llamadas into v_total;
    return v_total;
end;
$$;

-- Solo api/ia-generar.js (con la Service Role Key) debe poder sumar
-- cuota; nadie más necesita ejecutar esta función.
revoke execute on function ia_incrementar_uso(text, int) from public;
grant execute on function ia_incrementar_uso(text, int) to service_role;
