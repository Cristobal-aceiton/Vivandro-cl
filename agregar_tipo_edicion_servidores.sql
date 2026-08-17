-- =============================================================
--  agregar_tipo_edicion_servidores.sql
--  -----------------------------------------------------------
--  Antes, la web SIEMPRE consultaba el estado en vivo de cada
--  servidor como si fuera Java Edition (api.mcstatus.io/v2/
--  status/java/...). Si desde el panel admin se creaba un
--  servidor Bedrock (o Java+Bedrock), esa consulta fallaba o
--  mostraba mal el online/offline, porque Bedrock usa otro
--  protocolo y otro endpoint de la API.
--
--  Este script agrega una columna "tipo_edicion" para que, al
--  crear o editar un servidor desde el panel, se indique si es
--  Java o Bedrock, y la web sepa qué endpoint de mcstatus.io
--  consultar para cada uno.
--
--  CÓMO SE APLICA:
--    Supabase > SQL Editor > pegar este archivo > Run.
--    Es seguro correrlo aunque ya tengas servidores cargados:
--    a todos los existentes les queda "java" por defecto.
-- =============================================================

alter table servidores
    add column if not exists tipo_edicion text not null default 'java'
    check (tipo_edicion in ('java', 'bedrock'));
