-- =============================================================
--  arreglo_rechazar_no_repite.sql
--  -----------------------------------------------------------
--  Arregla: al rechazar un mod/textura generado por la IA, el
--  botón "Rechazar" lo BORRABA de la base de datos. Como
--  api/ia-generar.js decide qué ya existe consultando esas
--  mismas tablas, un ítem borrado vuelve a verse "nuevo" y
--  CurseForge lo vuelve a sugerir en la siguiente tanda.
--
--  Arreglo: agrega el estado 'rechazado' (además de 'publicado'
--  y 'pendiente'). El botón "Rechazar" ahora deja el ítem
--  guardado con ese estado en vez de borrarlo, así:
--    - sigue contando como "ya existe" para el generador IA
--      (nunca se vuelve a sugerir)
--    - no aparece en el sitio público (la policy de lectura
--      pública solo muestra 'publicado')
--    - no aparece en la lista normal del panel admin (se filtra
--      en admin-panel.js)
--
--  CÓMO SE APLICA: Supabase > SQL Editor > pegar todo > Run.
-- =============================================================

alter table mods
    drop constraint if exists mods_estado_check,
    add constraint mods_estado_check check (estado in ('publicado', 'pendiente', 'rechazado'));

alter table texturas
    drop constraint if exists texturas_estado_check,
    add constraint texturas_estado_check check (estado in ('publicado', 'pendiente', 'rechazado'));
