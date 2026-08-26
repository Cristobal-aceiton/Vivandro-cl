/*
  datos.js
  -----------------------------------------------------------
  Capa única de acceso a datos para "servidores", "mods" y
  "texturas". La usan tanto las páginas públicas como
  admin.js, así que hay un solo lugar que sabe hablar con
  Supabase.

  Requiere que supabase-client.js ya se haya cargado antes
  (variable global supabaseClient).

  Todas las funciones devuelven promesas. Si supabaseClient no
  está configurado todavía (ver supabase-client.js), las
  lecturas devuelven un array vacío y las escrituras rechazan,
  para que el sitio no se rompa mientras no exista backend.
  -----------------------------------------------------------
*/

const Datos = (function () {
    const TABLAS = ["servidores", "mods", "texturas"];

    function clienteListo() {
        return typeof supabaseClient !== "undefined" && supabaseClient !== null;
    }

    function chequearTabla(tabla) {
        if (!TABLAS.includes(tabla)) {
            throw new Error(`Tabla desconocida: ${tabla}`);
        }
    }

    async function listar(tabla) {
        chequearTabla(tabla);
        if (!clienteListo()) return [];
        const { data, error } = await supabaseClient
            .from(tabla)
            .select("*")
            .order("orden", { ascending: true })
            .order("creado_en", { ascending: true });
        if (error) {
            console.error(`[Datos] Error listando ${tabla}:`, error.message);
            return [];
        }
        return data || [];
    }

    // Trae una sola página de resultados (no toda la tabla), para no
    // castigar la carga de la web cuando hay muchos ítems. Se apoya en
    // .range() de Supabase, que traduce a un LIMIT/OFFSET real en la
    // base de datos: solo viaja por la red lo que se va a mostrar.
    //
    // Devuelve { datos, total, totalPaginas } donde "total" es la
    // cantidad de filas que cumplen los filtros (para poder calcular
    // cuántas páginas hay y armar la paginación).
    async function listarPagina(tabla, opciones = {}) {
        chequearTabla(tabla);
        const {
            pagina = 1,
            porPagina = 6,
            busqueda = "",
            modalidad = null,
        } = opciones;

        if (!clienteListo()) return { datos: [], total: 0, totalPaginas: 1 };

        const paginaSegura = Math.max(1, Math.floor(pagina) || 1);
        const desde = (paginaSegura - 1) * porPagina;
        const hasta = desde + porPagina - 1;

        let query = supabaseClient
            .from(tabla)
            .select("*", { count: "exact" })
            .order("orden", { ascending: true })
            .order("creado_en", { ascending: true })
            .range(desde, hasta);

        // mods/texturas tienen estado ('publicado' | 'pendiente' | 'rechazado').
        // Esta función la usan las páginas PÚBLICAS (mods.html, texturas.html),
        // así que siempre se filtra a "publicado" acá mismo, sin depender solo
        // de RLS: si quien navega el sitio es el propio admin logueado, RLS le
        // deja ver todo (para que el panel funcione), y sin este filtro vería
        // pendientes y rechazados mezclados en la vista pública.
        if (tabla === "mods" || tabla === "texturas") {
            query = query.eq("estado", "publicado");
        }

        const textoBusqueda = (busqueda || "").trim();
        if (textoBusqueda) {
            // Se escapan los comodines de ILIKE para que buscar "50%" o
            // "mod_x" no se interprete como patrón.
            const escapado = textoBusqueda.replace(/[%_]/g, (c) => `\\${c}`);
            query = query.ilike("nombre", `%${escapado}%`);
        }
        if (modalidad) {
            query = query.contains("modalidades", [modalidad]);
        }

        const { data, error, count } = await query;
        if (error) {
            console.error(`[Datos] Error listando página de ${tabla}:`, error.message);
            return { datos: [], total: 0, totalPaginas: 1 };
        }

        const total = count || 0;
        return {
            datos: data || [],
            total,
            totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
        };
    }

    // Trae un solo registro por id. Se usa para el link "Compartir": si
    // alguien abre mods.html?id=123 y ese mod no está en la página que
    // se cargó por defecto, igual lo podemos traer directo sin tener
    // que descargar toda la tabla ni adivinar en qué página está.
    async function obtenerPorId(tabla, id) {
        chequearTabla(tabla);
        if (!clienteListo() || !id) return null;
        let query = supabaseClient
            .from(tabla)
            .select("*")
            .eq("id", id);

        // Mismo motivo que en listarPagina: esta función la usan las
        // páginas públicas de detalle (mods.html, texturas.html) para
        // abrir un ítem por id. Si no está publicado, no debe mostrarse
        // aunque quien esté navegando sea el propio admin logueado.
        if (tabla === "mods" || tabla === "texturas") {
            query = query.eq("estado", "publicado");
        }

        const { data, error } = await query.maybeSingle();
        if (error) {
            console.error(`[Datos] Error obteniendo ${tabla} #${id}:`, error.message);
            return null;
        }
        return data;
    }

    // Trae solo la columna "modalidades" de todos los servidores (sin
    // el resto de sus datos) para poder armar los chips de filtro sin
    // tener que cargar la tabla completa de servidores.
    async function listarModalidades() {
        if (!clienteListo()) return [];
        const { data, error } = await supabaseClient.from("servidores").select("modalidades");
        if (error) {
            console.error("[Datos] Error listando modalidades:", error.message);
            return [];
        }
        const unicas = new Set();
        (data || []).forEach((fila) => (fila.modalidades || []).forEach((m) => unicas.add(m)));
        return [...unicas].sort();
    }

    async function crear(tabla, registro) {
        chequearTabla(tabla);
        if (!clienteListo()) throw new Error("Supabase no está configurado (ver supabase-client.js).");
        const { data, error } = await supabaseClient
            .from(tabla)
            .insert(registro)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async function actualizar(tabla, id, cambios) {
        chequearTabla(tabla);
        if (!clienteListo()) throw new Error("Supabase no está configurado (ver supabase-client.js).");
        const { data, error } = await supabaseClient
            .from(tabla)
            .update(cambios)
            .eq("id", id)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async function eliminar(tabla, id) {
        chequearTabla(tabla);
        if (!clienteListo()) throw new Error("Supabase no está configurado (ver supabase-client.js).");
        const { error } = await supabaseClient.from(tabla).delete().eq("id", id);
        if (error) throw error;
        return true;
    }

    // ---------- Descargas (estadísticas) ----------

    // Registra un click en "Descargar en CurseForge" a través de la
    // función registrar_descarga() en la base de datos (no hace un
    // INSERT directo): ahí se valida que el item exista de verdad y
    // se descartan clicks repetidos en menos de 2 segundos. No
    // bloquea la navegación del usuario si falla; es solo estadística.
    async function registrarDescarga(tipo, itemId) {
        if (!clienteListo() || !itemId) return;
        try {
            const { error } = await supabaseClient.rpc("registrar_descarga", {
                p_tipo: tipo,
                p_item_id: itemId,
            });
            if (error) throw error;
        } catch (e) {
            console.warn("[Datos] No se pudo registrar la descarga:", e.message);
        }
    }

    // Trae las filas de descargas filtradas. Solo el admin puede leer
    // (lo aplica RLS), así que si no eres admin esto vuelve vacío.
    async function listarDescargas({ tipo = null, itemId = null, desde = null } = {}) {
        if (!clienteListo()) return [];
        let query = supabaseClient.from("descargas").select("tipo, item_id, creado_en");
        if (tipo) query = query.eq("tipo", tipo);
        if (itemId) query = query.eq("item_id", itemId);
        if (desde) query = query.gte("creado_en", desde);
        const { data, error } = await query.order("creado_en", { ascending: true });
        if (error) {
            console.error("[Datos] Error listando descargas:", error.message);
            return [];
        }
        return data || [];
    }

    // ---------- Seguridad: bitácora e intentos de acceso ----------

    // Bitácora de crear/editar/eliminar. La escribe automáticamente
    // un trigger en la base de datos (no este archivo), así que acá
    // solo la leemos. Requiere ser admin (RLS).
    async function listarBitacora(limite = 30) {
        if (!clienteListo()) return [];
        const { data, error } = await supabaseClient
            .from("admin_log")
            .select("admin_email, accion, tabla, item_id, creado_en")
            .order("creado_en", { ascending: false })
            .limit(limite);
        if (error) {
            console.error("[Datos] Error listando bitácora:", error.message);
            return [];
        }
        return data || [];
    }

    // Deja constancia de que alguien inició sesión con Google pero
    // NO es el admin (útil para detectar intentos raros). Cada quien
    // solo puede insertar su propio intento (lo exige RLS), así que
    // no se puede falsificar a nombre de otra persona.
    async function registrarIntentoAcceso(email) {
        if (!clienteListo() || !email) return;
        try {
            await supabaseClient.from("intentos_acceso").insert({ email });
        } catch (e) {
            console.warn("[Datos] No se pudo registrar el intento de acceso:", e.message);
        }
    }

    async function listarIntentosAcceso(limite = 30) {
        if (!clienteListo()) return [];
        const { data, error } = await supabaseClient
            .from("intentos_acceso")
            .select("email, creado_en")
            .order("creado_en", { ascending: false })
            .limit(limite);
        if (error) {
            console.error("[Datos] Error listando intentos de acceso:", error.message);
            return [];
        }
        return data || [];
    }

    // Borra TODO el historial de intentos de acceso rechazados. Solo lo
    // puede hacer un admin (lo exige la política RLS "admin_borra_intentos",
    // ver fase2_tops_y_logs.sql); si quien llama no es admin, Supabase
    // simplemente no borra nada y no tira error.
    async function limpiarIntentosAcceso() {
        if (!clienteListo()) throw new Error("Supabase no está configurado (ver supabase-client.js).");
        // Supabase exige algún filtro para un delete masivo: "id" es un
        // bigint que siempre parte en 1, así que "distinto de 0" es
        // siempre verdadero y en la práctica borra todas las filas.
        const { error } = await supabaseClient.from("intentos_acceso").delete().neq("id", 0);
        if (error) throw error;
        return true;
    }

    // ---------- Administradores autorizados ----------
    // La tabla "admins" (ver agregar_tabla_admins.sql) es la que de
    // verdad decide quién puede leer/escribir en todo lo demás: las
    // políticas RLS de servidores/mods/texturas/etc. comprueban que
    // el email del JWT esté en esta tabla. Este archivo solo la lee
    // y escribe; la autorización real vuelve a resolverse en el
    // servidor (Postgres), igual que con el resto del panel.

    // Devuelve { email, es_superadmin } si el email es un admin
    // autorizado, o null si no lo es (o si la tabla todavía no
    // existe / RLS lo bloquea, lo cual para este propósito es lo
    // mismo que "no autorizado").
    async function obtenerAdmin(email) {
        if (!clienteListo() || !email) return null;
        try {
            const { data, error } = await supabaseClient
                .from("admins")
                .select("email, es_superadmin")
                .eq("email", email)
                .maybeSingle();
            if (error || !data) return null;
            return data;
        } catch (e) {
            return null;
        }
    }

    async function listarAdmins() {
        if (!clienteListo()) return [];
        const { data, error } = await supabaseClient
            .from("admins")
            .select("email, es_superadmin, creado_en")
            .order("creado_en", { ascending: true });
        if (error) {
            console.error("[Datos] Error listando administradores:", error.message);
            return [];
        }
        return data || [];
    }

    // Solo funciona si quien llama ya es superadmin: lo hace
    // cumplir la política RLS "solo_superadmin_escribe_admins" en
    // el servidor, no este código.
    async function agregarAdmin(email) {
        const { error } = await supabaseClient.from("admins").insert({ email });
        if (error) throw error;
    }

    async function eliminarAdmin(email) {
        const { error } = await supabaseClient.from("admins").delete().eq("email", email);
        if (error) throw error;
    }

    // ---------- Tops (Top 5 de cada categoría, sección "Tops" del panel) ----------
    // Cada fila de "tops" es un slot: qué mod/textura ocupa la posición N
    // (1 a 5) de un top_tipo determinado. Ver fase2_tops_y_logs.sql.
    const TOP_TIPOS = ["texturas_pvp", "mods_pvp", "texturas_survival"];

    // Trae las 3 x 5 filas de "tops" que existan (cualquiera puede leerlas,
    // están protegidas solo para escritura), sin los datos del mod/textura
    // en sí — eso lo resuelve listarTopsConItems() para no repetir el join
    // acá cuando solo hace falta saber qué posiciones están ocupadas.
    async function listarTops() {
        if (!clienteListo()) return [];
        const { data, error } = await supabaseClient
            .from("tops")
            .select("id, top_tipo, posicion, item_tabla, item_id");
        if (error) {
            console.error("[Datos] Error listando tops:", error.message);
            return [];
        }
        return data || [];
    }

    // Igual que listarTops(), pero cada fila trae además { nombre, imagen }
    // del mod/textura correspondiente, listo para pintar en pantalla (tanto
    // en el panel admin como en tops.html).
    async function listarTopsConItems() {
        const filas = await listarTops();
        if (filas.length === 0) return [];

        const idsMods = [...new Set(filas.filter((f) => f.item_tabla === "mods").map((f) => f.item_id))];
        const idsTexturas = [...new Set(filas.filter((f) => f.item_tabla === "texturas").map((f) => f.item_id))];

        const [resMods, resTexturas] = await Promise.all([
            idsMods.length ? supabaseClient.from("mods").select("id, nombre, imagen").in("id", idsMods) : Promise.resolve({ data: [] }),
            idsTexturas.length ? supabaseClient.from("texturas").select("id, nombre, imagen").in("id", idsTexturas) : Promise.resolve({ data: [] }),
        ]);

        const mapaMods = Object.fromEntries((resMods.data || []).map((m) => [m.id, m]));
        const mapaTexturas = Object.fromEntries((resTexturas.data || []).map((t) => [t.id, t]));

        return filas.map((f) => ({
            ...f,
            item: (f.item_tabla === "mods" ? mapaMods : mapaTexturas)[f.item_id] || null,
        }));
    }

    // Asigna (o reemplaza) el mod/textura de una posición puntual de un
    // Top. Un "upsert" sobre la clave única (top_tipo, posicion): si ya
    // había algo en ese casillero, lo reemplaza; si no, lo crea. La
    // validación real (que el Top acepte ese tipo de ítem y que el ítem
    // exista) la hace el trigger fn_validar_top() en la base de datos.
    async function asignarTop(topTipo, posicion, itemTabla, itemId) {
        if (!clienteListo()) throw new Error("Supabase no está configurado (ver supabase-client.js).");
        if (!TOP_TIPOS.includes(topTipo)) throw new Error(`Top desconocido: ${topTipo}`);
        const { data, error } = await supabaseClient
            .from("tops")
            .upsert(
                { top_tipo: topTipo, posicion, item_tabla: itemTabla, item_id: itemId },
                { onConflict: "top_tipo,posicion" }
            )
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    // Deja vacía una posición del Top (quita lo que hubiera ahí).
    async function quitarTop(topTipo, posicion) {
        if (!clienteListo()) throw new Error("Supabase no está configurado (ver supabase-client.js).");
        const { error } = await supabaseClient.from("tops").delete().eq("top_tipo", topTipo).eq("posicion", posicion);
        if (error) throw error;
        return true;
    }

    return {
        listar, listarPagina, listarModalidades, obtenerPorId, crear, actualizar, eliminar, clienteListo,
        registrarDescarga, listarDescargas,
        listarBitacora, registrarIntentoAcceso, listarIntentosAcceso, limpiarIntentosAcceso,
        obtenerAdmin, listarAdmins, agregarAdmin, eliminarAdmin,
        listarTops, listarTopsConItems, asignarTop, quitarTop,
    };
})();
