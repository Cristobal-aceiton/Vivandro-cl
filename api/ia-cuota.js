/*
  api/ia-cuota.js
  -----------------------------------------------------------
  Función serverless (Vercel) de solo lectura: devuelve cuántas
  llamadas se han hecho HOY a CurseForge y a Groq, y cuál es el
  límite diario configurado, para pintar el contador del panel
  ("CurseForge: 40 / 100 llamadas") apenas se abre la sección
  "Generador IA", sin gastar ninguna llamada real a esas APIs.

  Respuesta: { curseforge: { usadas, limite }, groq: { usadas, limite } }

  VARIABLES DE ENTORNO NECESARIAS: SUPABASE_URL y
  SUPABASE_SERVICE_ROLE_KEY (las mismas que ia-generar.js).
  -----------------------------------------------------------
*/

const { createClient } = require("@supabase/supabase-js");
const { esAdmin, tokenDesdeRequest, leerCuota } = require("./_ia-comun");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Faltan variables de entorno en el servidor (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)." });
    return;
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const token = tokenDesdeRequest(req);
  if (!token) {
    res.status(401).json({ error: "Falta el token de sesión." });
    return;
  }
  const email = await esAdmin(supabaseAdmin, token);
  if (!email) {
    res.status(403).json({ error: "No tienes permisos de administrador." });
    return;
  }

  const cuota = await leerCuota(supabaseAdmin);
  res.status(200).json({ cuota });
};
