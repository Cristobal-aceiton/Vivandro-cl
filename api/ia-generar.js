/*
  api/ia-generar.js
  -----------------------------------------------------------
  Función serverless (Vercel). La llama admin-panel.js, UNA vez
  por cada mod/textura que se quiere agregar (el panel hace el
  loop, no esta función), pasando { tipo, categoriaId, busqueda }.

  Qué hace, en orden:
    1) Verifica que quien llama está realmente logueado y es
       administrador (usa el propio JWT de Supabase + la función
       es_admin() ya definida en la base de datos).
    2) Revisa la cuota diaria de CurseForge; si ya se alcanzó el
       límite configurado, responde 429 sin gastar ni una llamada
       más (ver LEEME_GENERADOR_IA.md, sección "Cuota diaria").
    3) Trae los nombres/links que ya existen en "mods" y
       "texturas" para no repetir nada.
    4) Recupera de "ia_progreso" el índice donde quedó la última
       tanda para este mismo tipo + categoría + búsqueda, y busca
       en la API oficial de CurseForge (nunca inventa datos) desde
       ahí el primer mod/textura de Minecraft, ordenado por
       DESCARGAS TOTALES de mayor a menor, que todavía no esté en
       la base de datos. Opcionalmente filtra por categoryId de
       CurseForge y/o por una palabra clave (searchFilter), si el
       admin las eligió en el panel.
    5) Arma el registro con datos 100% reales de CurseForge:
       nombre, imagen, link, versión, cargadores y requisitos
       (dependencias obligatorias).
    6) Si hay GROQ_API_KEY configurada y no se alcanzó su cuota
       diaria, le pide a la IA (gratis, vía Groq) que reescriba
       SOLO la descripción en español, a partir de esos datos
       reales (nunca inventa funciones ni links).
    7) Inserta el registro en Supabase con estado = "pendiente"
       (no se publica solo; alguien lo tiene que aprobar en el
       panel).
    8) Guarda en "ia_progreso" el índice donde quedó, para que la
       siguiente tanda (hoy, mañana, o desde otra pestaña) siga
       exactamente ahí en vez de repetir desde 0.

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
    - CURSEFORGE_LIMITE_DIARIO  (opcional, default 100)
    - GROQ_LIMITE_DIARIO        (opcional, default 100)
  -----------------------------------------------------------
*/

const { createClient } = require("@supabase/supabase-js");
const { limpiar, esAdmin, tokenDesdeRequest, limiteDiario, leerUsoHoy, incrementarUso, leerCuota } = require("./_ia-comun");

const GAME_ID_MINECRAFT = 432;
// classId de CurseForge para cada categoría (ver /v1/categories?gameId=432&classesOnly=true
// si algún día CurseForge los cambia).
const CLASS_ID_POR_TIPO = { mods: 6, texturas: 12 };
const NOMBRE_CARGADOR = { 1: "Forge", 4: "Fabric", 6: "NeoForge" };
const RELATION_TYPE_REQUERIDO = 3; // FileRelationType.RequiredDependency

const TAMANO_PAGINA = 50;
const MAX_PAGINAS_POR_INTENTO = 20; // hasta 1000 mods revisados antes de rendirse

// Compara dos versiones tipo "1.20.1" numéricamente, parte por parte
// (así 1.9 < 1.10, a diferencia de una comparación de texto normal).
function compararVersiones(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const largo = Math.max(pa.length, pb.length);
  for (let i = 0; i < largo; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

// candidato.latestFilesIndexes trae, por cada archivo, la versión de
// Minecraft compatible. Un mismo mod puede tener varios archivos para
// distintas versiones (ej: 1.19.2, 1.20, 1.20.1). Sacamos todas las
// versiones válidas (descartando cosas como "Forge", "Java 17", que
// CurseForge a veces mezcla en el mismo campo) y devolvemos el rango
// "mínima - máxima". Si solo hay una, devolvemos esa sola.
function calcularRangoVersiones(candidato) {
  const versiones = new Set();
  (candidato.latestFilesIndexes || []).forEach((f) => {
    const v = limpiar(f.gameVersion);
    if (/^\d+(\.\d+){1,2}$/.test(v)) versiones.add(v);
  });

  const ordenadas = [...versiones].sort(compararVersiones);
  if (ordenadas.length === 0) return "";
  if (ordenadas.length === 1) return ordenadas[0];
  return `${ordenadas[0]} - ${ordenadas[ordenadas.length - 1]}`;
}

// Normaliza categoriaId/busqueda para que "sin filtro" siempre quede
// representado igual (0 / "") y así el progreso guardado (que se
// busca por esta misma combinación) se encuentre siempre.
function normalizarFiltros(categoriaId, busqueda) {
  const catNum = parseInt(categoriaId, 10);
  return {
    categoriaId: Number.isInteger(catNum) && catNum > 0 ? catNum : 0,
    busqueda: limpiar(busqueda).toLowerCase().slice(0, 100),
  };
}

async function obtenerProgresoGuardado(supabaseAdmin, tipo, categoriaId, busqueda) {
  const { data, error } = await supabaseAdmin
    .from("ia_progreso")
    .select("indice")
    .eq("tipo", tipo)
    .eq("categoria_id", categoriaId)
    .eq("busqueda", busqueda)
    .maybeSingle();
  if (error) return 0; // si falla la lectura, mejor empezar de 0 que romper la generación
  return data?.indice || 0;
}

async function guardarProgreso(supabaseAdmin, tipo, categoriaId, busqueda, indice) {
  await supabaseAdmin
    .from("ia_progreso")
    .upsert(
      { tipo, categoria_id: categoriaId, busqueda, indice, actualizado_en: new Date().toISOString() },
      { onConflict: "tipo,categoria_id,busqueda" }
    );
  // Si falla el guardado no interrumpimos la respuesta: en el peor
  // caso la siguiente tanda revisa de nuevo algunas páginas ya vistas.
}

async function buscarCandidato({ apiKey, classId, categoriaId, busqueda, existentesNombres, existentesUrls, indiceInicio, supabaseAdmin, limiteCurseforge }) {
  let index = Number.isInteger(indiceInicio) && indiceInicio >= 0 ? indiceInicio : 0;
  let paginas = 0;

  while (paginas < MAX_PAGINAS_POR_INTENTO) {
    // Chequeo de cuota ANTES de cada página: si una tanda larga
    // (varios mods pedidos de una vez) va gastando la cuota mientras
    // recorre páginas, se corta apenas se alcanza el límite en vez
    // de seguir pidiendo de todos modos.
    const usadasHoy = await leerUsoHoy(supabaseAdmin, "curseforge");
    if (usadasHoy >= limiteCurseforge) {
      const err = new Error(`Se alcanzó la cuota diaria de CurseForge (${limiteCurseforge} llamadas). Vuelve a intentar mañana o sube el límite en CURSEFORGE_LIMITE_DIARIO.`);
      err.cuotaAgotada = true;
      err.siguienteIndice = index;
      throw err;
    }

    let url = `https://api.curseforge.com/v1/mods/search?gameId=${GAME_ID_MINECRAFT}&classId=${classId}&sortField=6&sortOrder=desc&pageSize=${TAMANO_PAGINA}&index=${index}`;
    if (categoriaId) url += `&categoryId=${categoriaId}`;
    if (busqueda) url += `&searchFilter=${encodeURIComponent(busqueda)}`;

    const cfRes = await fetch(url, {
      headers: { Accept: "application/json", "x-api-key": apiKey },
    });
    await incrementarUso(supabaseAdmin, "curseforge", 1);

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

async function obtenerRequisitos(apiKey, candidato, supabaseAdmin, limiteCurseforge) {
  try {
    const depsIds = (candidato.latestFiles?.[0]?.dependencies || [])
      .filter((d) => d.relationType === RELATION_TYPE_REQUERIDO)
      .map((d) => d.modId)
      .slice(0, 4);
    if (depsIds.length === 0) return [];

    // Enriquecimiento opcional: si ya no queda cuota, seguimos sin
    // requisitos en vez de gastar la última llamada disponible en
    // algo secundario.
    const usadasHoy = await leerUsoHoy(supabaseAdmin, "curseforge");
    if (usadasHoy >= limiteCurseforge) return [];

    const resp = await fetch("https://api.curseforge.com/v1/mods", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ modIds: depsIds }),
    });
    await incrementarUso(supabaseAdmin, "curseforge", 1);
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

async function redactarDescripcion({ apiKey, tipo, candidato, categoria, version, supabaseAdmin, limiteGroq }) {
  const original = limpiar(candidato.summary);
  if (!apiKey || !original) return original;

  // Si ya se alcanzó la cuota diaria de Groq, seguimos igual con el
  // resumen original en inglés en vez de fallar la generación entera.
  const usadasHoy = await leerUsoHoy(supabaseAdmin, "groq");
  if (usadasHoy >= limiteGroq) return original;

  // Timeout manual: si Groq no responde en 15s, seguimos con el resumen
  // original en vez de dejar la función colgada.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const prompt = `Eres redactor de una web de Minecraft en español (Chile). Te paso datos REALES de ${tipo === "mods" ? "un mod" : "un pack de texturas"} obtenidos de CurseForge. Escribe una descripción de 2 a 3 frases en español, atractiva y natural para el público de la web, usando SOLO la información entregada abajo (no inventes funciones, cifras ni compatibilidades que no estén acá). Responde solo con la descripción en texto plano, sin comillas ni markdown.

Nombre: ${candidato.name}
Categoría: ${categoria || "sin categoría específica"}
Resumen original (en inglés, de CurseForge): ${original}
Versión(es) de Minecraft compatibles: ${version || "no especificada"}`;

    const iaRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        max_tokens: 300,
        temperature: 0.7,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    await incrementarUso(supabaseAdmin, "groq", 1);

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

  const { tipo, categoriaId: categoriaIdCruda, busqueda: busquedaCruda } = req.body || {};
  if (tipo !== "mods" && tipo !== "texturas") {
    res.status(400).json({ error: 'El campo "tipo" debe ser "mods" o "texturas".' });
    return;
  }
  const { categoriaId, busqueda } = normalizarFiltros(categoriaIdCruda, busquedaCruda);

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---- 1) Autenticación: solo administradores reales ----
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

  // ---- 2) Cuota diaria: si ya se alcanzó, ni siquiera intentamos ----
  const limiteCurseforge = limiteDiario("CURSEFORGE_LIMITE_DIARIO");
  const limiteGroq = limiteDiario("GROQ_LIMITE_DIARIO");
  const usoCurseforgeHoy = await leerUsoHoy(supabaseAdmin, "curseforge");
  if (usoCurseforgeHoy >= limiteCurseforge) {
    const cuota = await leerCuota(supabaseAdmin);
    res.status(429).json({
      error: `Se alcanzó la cuota diaria de CurseForge (${limiteCurseforge} llamadas). Vuelve a intentar mañana.`,
      cuotaAgotada: true,
      cuota,
    });
    return;
  }

  try {
    // ---- 3) Qué ya existe (para no duplicar) ----
    const [{ data: modsExistentes }, { data: texturasExistentes }] = await Promise.all([
      supabaseAdmin.from("mods").select("nombre, curseforge_url"),
      supabaseAdmin.from("texturas").select("nombre, curseforge_url"),
    ]);
    const todos = [...(modsExistentes || []), ...(texturasExistentes || [])];
    const existentesNombres = new Set(todos.map((x) => limpiar(x.nombre).toLowerCase()));
    const existentesUrls = new Set(todos.map((x) => limpiar(x.curseforge_url).toLowerCase()));

    // ---- 4) Progreso guardado + buscar candidato nuevo en CurseForge ----
    const classId = CLASS_ID_POR_TIPO[tipo];
    const indiceGuardado = await obtenerProgresoGuardado(supabaseAdmin, tipo, categoriaId, busqueda);

    const { candidato, siguienteIndice } = await buscarCandidato({
      apiKey: CURSEFORGE_API_KEY,
      classId,
      categoriaId,
      busqueda,
      existentesNombres,
      existentesUrls,
      indiceInicio: indiceGuardado,
      supabaseAdmin,
      limiteCurseforge,
    });

    // Guardamos el progreso siempre (haya o no candidato), así la
    // próxima tanda no vuelve a revisar las páginas ya descartadas.
    await guardarProgreso(supabaseAdmin, tipo, categoriaId, busqueda, siguienteIndice);

    if (!candidato) {
      const cuota = await leerCuota(supabaseAdmin);
      res.status(200).json({ agotado: true, siguienteIndice, cuota });
      return;
    }

    // ---- 5) Armar el registro con datos reales ----
    const versionMinecraft = calcularRangoVersiones(candidato);
    const categoria = limpiar(candidato.categories?.[0]?.name);

    let cargadores = [];
    if (tipo === "mods") {
      const set = new Set();
      (candidato.latestFilesIndexes || []).forEach((f) => {
        if (NOMBRE_CARGADOR[f.modLoader]) set.add(NOMBRE_CARGADOR[f.modLoader]);
      });
      cargadores = [...set];
    }

    const requisitos = tipo === "mods" ? await obtenerRequisitos(CURSEFORGE_API_KEY, candidato, supabaseAdmin, limiteCurseforge) : [];

    const descripcion = await redactarDescripcion({
      apiKey: GROQ_API_KEY,
      tipo,
      candidato,
      categoria,
      version: versionMinecraft,
      supabaseAdmin,
      limiteGroq,
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

    // ---- 6) Insertar. Usamos el service role (ya verificamos admin arriba a mano). ----
    const { data: insertado, error: insertError } = await supabaseAdmin
      .from(tipo)
      .insert(registro)
      .select()
      .single();

    const cuota = await leerCuota(supabaseAdmin);

    if (insertError) {
      res.status(409).json({ error: insertError.message, siguienteIndice, cuota });
      return;
    }

    res.status(200).json({ item: insertado, siguienteIndice, cuota });
  } catch (err) {
    const cuota = await leerCuota(supabaseAdmin).catch(() => null);
    res.status(err.cuotaAgotada ? 429 : 502).json({
      error: err.message || "Error inesperado buscando en CurseForge.",
      siguienteIndice: err.siguienteIndice,
      cuotaAgotada: !!err.cuotaAgotada,
      cuota,
    });
  }
};
