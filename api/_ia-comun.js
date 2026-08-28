/*
  api/_ia-comun.js
  -----------------------------------------------------------
  Funciones compartidas por las funciones serverless del
  Generador IA (ia-generar.js, ia-categorias.js, ia-cuota.js):
  autenticación de administrador y control de cuota diaria.

  El guion bajo al inicio del nombre de archivo es a propósito:
  Vercel ignora los archivos que empiezan con "_" dentro de /api,
  así que esto NO se convierte en un endpoint público, solo lo
  pueden usar los otros archivos de /api con require(...).
  -----------------------------------------------------------
*/

function limpiar(texto) {
  return (texto || "").toString().trim();
}

// Verifica el JWT de Supabase (login con Google) y que ese email
// esté en la tabla "admins" (función es_admin() ya definida en la
// base de datos). Devuelve el email si es admin, o null si no.
async function esAdmin(supabaseAdmin, token) {
  const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userData?.user?.email) return null;
  const email = userData.user.email;
  const { data: esAdminData, error: rpcError } = await supabaseAdmin.rpc("es_admin", { p_email: email });
  if (rpcError || !esAdminData) return null;
  return email;
}

function tokenDesdeRequest(req) {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

// ---------- Cuota diaria (CurseForge y Groq) ----------
// Límite configurable por variable de entorno en Vercel
// (CURSEFORGE_LIMITE_DIARIO / GROQ_LIMITE_DIARIO). Si no se
// configura, 100 llamadas por día para cada servicio (ajusta este
// número según el plan real de tu API key en cada proveedor).
function limiteDiario(nombreEnv) {
  const n = parseInt(process.env[nombreEnv], 10);
  return Number.isInteger(n) && n > 0 ? n : 100;
}

function fechaHoyUTC() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

async function leerUsoHoy(supabaseAdmin, servicio) {
  const { data, error } = await supabaseAdmin
    .from("ia_uso_diario")
    .select("llamadas")
    .eq("fecha", fechaHoyUTC())
    .eq("servicio", servicio)
    .maybeSingle();
  if (error) return 0; // si falla la lectura no bloqueamos por un problema aparte
  return data?.llamadas || 0;
}

// Suma "cantidad" llamadas al contador de hoy para ese servicio, de
// forma atómica (función SQL ia_incrementar_uso, ver
// agregar_progreso_y_cuota_generador_ia.sql). Devuelve el total del
// día después de sumar, o null si falló.
async function incrementarUso(supabaseAdmin, servicio, cantidad = 1) {
  const { data, error } = await supabaseAdmin.rpc("ia_incrementar_uso", {
    p_servicio: servicio,
    p_cantidad: cantidad,
  });
  if (error) return null;
  return data;
}

async function leerCuota(supabaseAdmin) {
  const [curseforge, groq] = await Promise.all([
    leerUsoHoy(supabaseAdmin, "curseforge"),
    leerUsoHoy(supabaseAdmin, "groq"),
  ]);
  return {
    curseforge: { usadas: curseforge, limite: limiteDiario("CURSEFORGE_LIMITE_DIARIO") },
    groq: { usadas: groq, limite: limiteDiario("GROQ_LIMITE_DIARIO") },
  };
}

module.exports = {
  limpiar,
  esAdmin,
  tokenDesdeRequest,
  limiteDiario,
  leerUsoHoy,
  incrementarUso,
  leerCuota,
};
