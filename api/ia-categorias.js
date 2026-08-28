/*
  api/ia-categorias.js
  -----------------------------------------------------------
  Función serverless (Vercel). La llama admin-panel.js cuando se
  abre la sección "Generador IA" o se cambia el tipo (Mods /
  Texturas), para llenar el selector de categorías con las
  categorías REALES que CurseForge tiene definidas para mods
  (classId 6) o packs de texturas (classId 12) de Minecraft.
  Nunca se inventa ni se hardcodea una lista: siempre se pide a
  la API oficial de CurseForge (GET /v1/categories), igual que el
  resto del Generador IA.

  Body esperado: { tipo: "mods" | "texturas" }

  Respuesta: { categorias: [{ id, nombre }, ...] }, ordenadas
  alfabéticamente.

  Cuenta como 1 llamada a la cuota diaria de CurseForge (ver
  LEEME_GENERADOR_IA.md). El panel guarda el resultado en memoria
  mientras la pestaña sigue abierta para no repetir la consulta.

  VARIABLES DE ENTORNO NECESARIAS: las mismas que ia-generar.js
  (CURSEFORGE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
  -----------------------------------------------------------
*/

const { createClient } = require("@supabase/supabase-js");
const { limpiar, esAdmin, tokenDesdeRequest, limiteDiario, leerUsoHoy, incrementarUso, leerCuota } = require("./_ia-comun");

const GAME_ID_MINECRAFT = 432;
const CLASS_ID_POR_TIPO = { mods: 6, texturas: 12 };

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const { CURSEFORGE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!CURSEFORGE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({
      error: "Faltan variables de entorno en el servidor (CURSEFORGE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). Ver LEEME_GENERADOR_IA.md.",
    });
    return;
  }

  const { tipo } = req.body || {};
  if (tipo !== "mods" && tipo !== "texturas") {
    res.status(400).json({ error: 'El campo "tipo" debe ser "mods" o "texturas".' });
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

  const limiteCurseforge = limiteDiario("CURSEFORGE_LIMITE_DIARIO");
  const usadasHoy = await leerUsoHoy(supabaseAdmin, "curseforge");
  if (usadasHoy >= limiteCurseforge) {
    const cuota = await leerCuota(supabaseAdmin);
    res.status(429).json({
      error: `Se alcanzó la cuota diaria de CurseForge (${limiteCurseforge} llamadas). Vuelve a intentar mañana.`,
      cuotaAgotada: true,
      cuota,
    });
    return;
  }

  try {
    const classId = CLASS_ID_POR_TIPO[tipo];
    const url = `https://api.curseforge.com/v1/categories?gameId=${GAME_ID_MINECRAFT}&classId=${classId}`;
    const cfRes = await fetch(url, { headers: { Accept: "application/json", "x-api-key": CURSEFORGE_API_KEY } });
    await incrementarUso(supabaseAdmin, "curseforge", 1);

    if (!cfRes.ok) {
      const texto = await cfRes.text().catch(() => "");
      res.status(502).json({ error: `CurseForge respondió ${cfRes.status}: ${texto.slice(0, 200)}` });
      return;
    }

    const body = await cfRes.json();
    const categorias = (body?.data || [])
      .map((c) => ({ id: c.id, nombre: limpiar(c.name) }))
      .filter((c) => c.nombre)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    const cuota = await leerCuota(supabaseAdmin);
    res.status(200).json({ categorias, cuota });
  } catch (err) {
    res.status(502).json({ error: err.message || "Error inesperado consultando categorías en CurseForge." });
  }
};
