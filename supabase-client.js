/*
  supabase-client.js
  -----------------------------------------------------------
  Cuando tengas tu proyecto de Supabase creado:
    1. Reemplaza SUPABASE_URL y SUPABASE_ANON_KEY abajo con
       los datos de Settings > API en tu panel de Supabase.
    2. Crea las tablas con el SQL que dejamos comentado más
       abajo (Table Editor > SQL editor > pegar y ejecutar).
    3. Listo, no hay que tocar nada más: servidor-detalle.html
       ya está escrito para usar "supabaseClient" si existe.

  Mientras SUPABASE_URL no esté configurada, supabaseClient
  queda en null y las reseñas usan localStorage como modo
  demo, para que se pueda seguir probando el sitio sin backend.
  -----------------------------------------------------------

  ---- SQL para crear la tabla de reseñas en Supabase (con login) ----
  Ver el archivo aparte: crear_tabla_resenas.sql
  (incluye login obligatorio con Google, máx 300 caracteres,
  y 1 reseña por servidor por usuario).

  ---- Para que el login con Google funcione hay que activarlo ----
  1. Ve a Authentication > Sign In / Providers en tu panel de Supabase.
  2. Activa "Google" y sigue el asistente (te va a pedir crear un
     OAuth Client ID en Google Cloud Console, es gratis).
  3. En "Redirect URLs" agrega la URL donde vas a alojar el sitio
     (ej: https://vivandro.cl) y también http://localhost si vas
     a probar en local.
  Nada de esto se toca en el código, es 100% configuración en el panel.

  -----------------------------------------------------------
*/

const SUPABASE_URL = "https://hridipfqnqcilnhopszo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_cAMvIdb3u3biq7imK5ovWQ_R8ehiNfo";

let supabaseClient = null;

function supabaseListo() {
    return (
        SUPABASE_URL &&
        SUPABASE_ANON_KEY &&
        !SUPABASE_URL.includes("TU_SUPABASE_URL_AQUI") &&
        typeof supabase !== "undefined"
    );
}

if (supabaseListo()) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("[Supabase] Conectado.");
} else {
    console.log("[Supabase] Sin conectar todavía. Las reseñas usan localStorage como demo. Edita supabase-client.js para conectar.");
}
