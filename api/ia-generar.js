/*
  api/ia-generar.js
  -----------------------------------------------------------
  Función serverless (Vercel). La llama admin-panel.js, UNA vez
  por cada mod/textura que se quiere agregar (el panel hace el
  loop, no esta función), pasando { tipo, indiceInicio }.

  Qué hace, en orden:
    1) Verifica que quien llama está realmente logueado y es
       administrador (usa el propio JWT de Supabase + la función
       es_admin() ya definida en la base de datos).
    2) Trae los nombres/links que ya existen en "mods" y
       "texturas" para no repetir nada.
    3) Busca en la API oficial de CurseForge (nunca inventa
       datos) el primer mod/textura de Minecraft, ordenado por
       popularidad, que todavía no esté en la base de datos.
    4) Arma el registro con datos 100% reales de CurseForge:
       nombre, imagen, link, versión, cargadores y requisitos
       (dependencias obligatorias).
    5) Si hay GROQ_API_KEY configurada, le pide a la IA (gratis, vía
       Groq) que reescriba SOLO la descripción en español, a partir
       de esos datos reales (nunca inventa funciones ni links).
    6) Inserta el registro en Supabase con estado = "pendiente"
       (no se publica solo; alguien lo tiene que aprobar en el
       panel).

  VARIABLES DE ENTORNO NECESARIAS (Vercel > Settings > Environment
  Variables del proyecto):
    - CURSEFORGE_API_KEY        (ver LEEME_GENERADOR_IA.md)
    - SUPABASE_URL              (la misma que supabase-client.js)
    - SUPABASE_SERVICE_ROLE_KEY (Supabase > Settings > API > service_role.
                                  ¡Nunca poner esta clave en el navegador!
                                  Solo existe acá, del lado del servidor.)
    - GROQ_API_KEY              (opcional y GRATIS; sin ella se usa el
                                  resumen original de CurseForge, en inglés.
                                  Se consigue en console.groq.com)
  -----------------------------------------------------------
*/

const { createClient } = require("@supabase/supabase-js");

const GAME_ID_MINECRAFT = 432;
// classId de CurseForge para cada categoría (ver /v1/categories?gameId=432&classesOnly=true
// si algún día CurseForge los cambia).
const CLASS_ID_POR_TIPO = { mods: 6, texturas: 12 };
const NOMBRE_CARGADOR = { 1: "Forge", 4: "Fabric", 6: "NeoForge" };
const RELATION_TYPE_REQUERIDO = 3; // FileRelationType.RequiredDependency

const TAMANO_PAGINA = 50;
const MAX_PAGINAS_POR_INTENTO = 20; // hasta 1000 mods revisados antes de rendirse

function limpiar(texto) {
  return (texto || "").toString().trim();
}

async function esAdmin(supabaseAdmin, token) {
  const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userData?.user?.email) return null;
  const email = userData.user.email;
  const { data: esAdminData, error: rpcError } = await supabaseAdmin.rpc("es_admin", { p_email: email });
  if (rpcError || !esAdminData) return null;
  return email;
}

async function buscarCandidato({ apiKey, classId, existentesNombres, existentesUrls, indiceInicio }) {
  let index = Number.isInteger(indiceInicio) && indiceInicio >= 0 ? indiceInicio : 0;
  let paginas = 0;

  while (paginas < MAX_PAGINAS_POR_INTENTO) {
    const url = `https://api.curseforge.com/v1/mods/search?gameId=${GAME_ID_MINECRAFT}&classId=${classId}&sortField=2&sortOrder=desc&pageSize=${TAMANO_PAGINA}&index=${index}`;
    const cfRes = await fetch(url, {
      headers: { Accept: "application/json", "x-api-key": apiKey },
    });

    if (!cfRes.ok) {
      const texto = await cfRes.text().catch(() => "");
      const err = new Error(`CurseForge respondió ${cfRes.status}: ${texto.slice(0, 200)}`);
      err.siguienteIndice = index;
      throw err;
    }

    const body = await cfRes.json();
    const items = body?.data || [];
    if (items.length === 0) return { candidato: null, siguienteIndice: index };

    for (const item of items) {
      const nombre = limpiar(item.name);
      const urlCF = limpiar(item.links?.websiteUrl);
      const imagen = limpiar(item.logo?.thumbnailUrl || item.logo?.url);
      if (!nombre || !urlCF || !imagen) continue;
      if (item.allowModDistribution === false) continue; // el autor no permite redistribución/enlace externo
      if (existentesNombres.has(nombre.toLowerCase())) continue;
      if (existentesUrls.has(urlCF.toLowerCase())) continue;
      index += TAMANO_PAGINA;
      return { candidato: item, siguienteIndice: index };
    }

    index += TAMANO_PAGINA;
    paginas++;
  }

  return { candidato: null, siguienteIndice: index };
}

async function obtenerRequisitos(apiKey, candidato) {
  try {
    const depsIds = (candidato.latestFiles?.[0]?.dependencies || [])
      .filter((d) => d.relationType === RELATION_TYPE_REQUERIDO)
      .map((d) => d.modId)
      .slice(0, 4);
    if (depsIds.length === 0) return [];

    const resp = await fetch("https://api.curseforge.com/v1/mods", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ modIds: depsIds }),
    });
    if (!resp.ok) return [];
    const body = await resp.json();
    return (body?.data || [])
      .filter((d) => d.links?.websiteUrl)
      .map((d) => ({ nombre: limpiar(d.name), url: limpiar(d.links.websiteUrl) }))
      .slice(0, 4);
  } catch (e) {
    return []; // enriquecimiento opcional: si falla, seguimos sin requisitos
  }
}

async function redactarDescripcion({ apiKey, tipo, candidato, categoria, version }) {
  const original = limpiar(candidato.summary);
  if (!apiKey || !original) return original;

  // Timeout manual: si Groq no responde en 15s, seguimos con el resumen
  // original en vez de dejar la función colgada.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const prompt = `Eres redactor de una web de Minecraft en español (Chile). Te paso datos REALES de ${tipo === "mods" ? "un mod" : "un pack de texturas"} obtenidos de CurseForge. Escribe una descripción de 2 a 3 frases en español, atractiva y natural para el público de la web, usando SOLO la información entregada abajo (no inventes funciones, cifras ni compatibilidades que no estén acá). Responde solo con la descripción en texto plano, sin comillas ni markdown.

Nombre: ${candidato.name}
Categoría: ${categoria || "sin categoría específica"}
Resumen original (en inglés, de CurseForge): ${original}
Versión de Minecraft: ${version || "no especificada"}`;

    const iaRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 300,
        temperature: 0.7,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!iaRes.ok) {
      // No tiramos error: si Groq falla (key inválida, rate limit, etc.)
      // igual queremos que el mod/textura se guarde con el resumen original.
      return original;
    }

    const iaBody = await iaRes.json();
    const texto = limpiar(iaBody?.choices?.[0]?.message?.content);
    return texto || original;
  } catch (e) {
    // Cubre timeout (AbortError), caída de red, JSON inválido, etc.
    return original;
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const { CURSEFORGE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY } = process.env;

  if (!CURSEFORGE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({
      error: "Faltan variables de entorno en el servidor (CURSEFORGE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). Ver LEEME_GENERADOR_IA.md.",
    });
    return;
  }

  const { tipo, indiceInicio } = req.body || {};
  if (tipo !== "mods" && tipo !== "texturas") {
    res.status(400).json({ error: 'El campo "tipo" debe ser "mods" o "texturas".' });
    return;
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---- 1) Autenticación: solo administradores reales ----
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Falta el token de sesión." });
    return;
  }

  const email = await esAdmin(supabaseAdmin, token);
  if (!email) {
    res.status(403).json({ error: "No tienes permisos de administrador." });
    return;
  }

  try {
    // ---- 2) Qué ya existe (para no duplicar) ----
    const [{ data: modsExistentes }, { data: texturasExistentes }] = await Promise.all([
      supabaseAdmin.from("mods").select("nombre, curseforge_url"),
      supabaseAdmin.from("texturas").select("nombre, curseforge_url"),
    ]);
    const todos = [...(modsExistentes || []), ...(texturasExistentes || [])];
    const existentesNombres = new Set(todos.map((x) => limpiar(x.nombre).toLowerCase()));
    const existentesUrls = new Set(todos.map((x) => limpiar(x.curseforge_url).toLowerCase()));

    // ---- 3) Buscar candidato nuevo en CurseForge ----
    const classId = CLASS_ID_POR_TIPO[tipo];
    const { candidato, siguienteIndice } = await buscarCandidato({
      apiKey: CURSEFORGE_API_KEY,
      classId,
      existentesNombres,
      existentesUrls,
      indiceInicio,
    });

    if (!candidato) {
      res.status(200).json({ agotado: true, siguienteIndice });
      return;
    }

    // ---- 4) Armar el registro con datos reales ----
    const versionMinecraft = limpiar(
      candidato.latestFilesIndexes?.find((f) => f.gameVersion)?.gameVersion
    );
    const categoria = limpiar(candidato.categories?.[0]?.name);

    let cargadores = [];
    if (tipo === "mods") {
      const set = new Set();
      (candidato.latestFilesIndexes || []).forEach((f) => {
        if (NOMBRE_CARGADOR[f.modLoader]) set.add(NOMBRE_CARGADOR[f.modLoader]);
      });
      cargadores = [...set];
    }

    const requisitos = tipo === "mods" ? await obtenerRequisitos(CURSEFORGE_API_KEY, candidato) : [];

    const descripcion = await redactarDescripcion({
      apiKey: GROQ_API_KEY,
      tipo,
      candidato,
      categoria,
      version: versionMinecraft,
    });

    const registro = {
      nombre: candidato.name,
      descripcion,
      imagen: limpiar(candidato.logo?.thumbnailUrl || candidato.logo?.url),
      curseforge_url: candidato.links.websiteUrl,
      version_minecraft: versionMinecraft,
      categoria,
      estado: "pendiente",
      generado_ia: true,
    };
    if (tipo === "mods") {
      registro.cargadores = cargadores;
      registro.requisitos = requisitos;
    }

    // ---- 5) Insertar. Usamos el service role (ya verificamos admin arriba a mano). ----
    const { data: insertado, error: insertError } = await supabaseAdmin
      .from(tipo)
      .insert(registro)
      .select()
      .single();

    if (insertError) {
      res.status(409).json({ error: insertError.message, siguienteIndice });
      return;
    }

    res.status(200).json({ item: insertado, siguienteIndice });
  } catch (err) {
    res.status(502).json({ error: err.message || "Error inesperado buscando en CurseForge.", siguienteIndice: err.siguienteIndice });
  }
};
