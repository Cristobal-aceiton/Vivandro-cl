-- Agrega e7440514@gmail.com como segundo admin en TODAS las políticas RLS.
-- Pega esto completo en Supabase → SQL Editor → Run.

-- servidores / mods / texturas (db_schema_admin.sql)
drop policy if exists "admin_write_servidores" on servidores;
create policy "admin_write_servidores" on servidores
    for all
    using (auth.jwt() ->> 'email' in ('cristobalaceiton4@gmail.com', 'e7440514@gmail.com'))
    with check (auth.jwt() ->> 'email' in ('cristobalaceiton4@gmail.com', 'e7440514@gmail.com'));

drop policy if exists "admin_write_mods" on mods;
create policy "admin_write_mods" on mods
    for all
    using (auth.jwt() ->> 'email' in ('cristobalaceiton4@gmail.com', 'e7440514@gmail.com'))
    with check (auth.jwt() ->> 'email' in ('cristobalaceiton4@gmail.com', 'e7440514@gmail.com'));

drop policy if exists "admin_write_texturas" on texturas;
create policy "admin_write_texturas" on texturas
    for all
    using (auth.jwt() ->> 'email' in ('cristobalaceiton4@gmail.com', 'e7440514@gmail.com'))
    with check (auth.jwt() ->> 'email' in ('cristobalaceiton4@gmail.com', 'e7440514@gmail.com'));

-- descargas (crear_tabla_descargas.sql)
drop policy if exists "admin_lee_descargas" on descargas;
create policy "admin_lee_descargas" on descargas
    for select
    using (auth.jwt() ->> 'email' in ('cristobalaceiton4@gmail.com', 'e7440514@gmail.com'));

drop policy if exists "admin_borra_descargas" on descargas;
create policy "admin_borra_descargas" on descargas
    for delete
    using (auth.jwt() ->> 'email' in ('cristobalaceiton4@gmail.com', 'e7440514@gmail.com'));

-- admin_log / intentos_acceso (mejoras_seguridad_backend.sql)
drop policy if exists "admin_lee_log" on admin_log;
create policy "admin_lee_log" on admin_log
    for select
    using (auth.jwt() ->> 'email' in ('cristobalaceiton4@gmail.com', 'e7440514@gmail.com'));

drop policy if exists "admin_lee_intentos" on intentos_acceso;
create policy "admin_lee_intentos" on intentos_acceso
    for select
    using (auth.jwt() ->> 'email' in ('cristobalaceiton4@gmail.com', 'e7440514@gmail.com'));
