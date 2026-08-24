/*
  admin-panel.js
  -----------------------------------------------------------
  Lógica del panel de administración.

  IMPORTANTE SOBRE SEGURIDAD:
  El check contra la tabla "admins" que se hace aquí abajo es
  SOLO para decidir si se muestra o esconde la interfaz (UX).
  No es lo que realmente protege los datos: eso lo hacen las
  políticas de Row Level Security en Supabase (ver
  db_schema_admin.sql y agregar_tabla_admins.sql), que corren en
  el servidor y comprueban el JWT firmado por Supabase Auth.
  Aunque alguien manipule este archivo JS en su navegador,
  cualquier intento de crear, editar o eliminar sin estar en la
  tabla "admins" va a ser rechazado por la base de datos, no por
  este código.
  -----------------------------------------------------------
*/

// Ya no hay un único "ADMIN_EMAIL" hardcodeado para el manejo del
// día a día: quién puede entrar se decide consultando la tabla
// "admins" en Supabase (ver agregar_tabla_admins.sql), que es
// también la que revisan las políticas RLS del resto de las
// tablas. Igual dejamos esta cuenta como "puerta de emergencia":
// siempre entra como superadmin aunque la tabla "admins" todavía
// no exista, esté vacía, o falle la consulta por algún motivo — así
// nunca te puedes quedar afuera de tu propio panel. Está reforzado
// en el mismo lugar dentro de agregar_tabla_admins.sql (funciones
// es_admin/es_superadmin), así que también sigue funcionando del
// lado del servidor (RLS), no solo acá.
const SUPERADMIN_EMERGENCIA = "cristobalaceiton4@gmail.com";

let sesionAdmin = null; // { email, esSuperadmin } una vez autorizado, si no null

const SECCIONES = {
    servidores: {
        tabla: "servidores",
        titulo: "Servidores",
        columnas: ["Imagen", "Nombre", "IP", "Edición", "Jugadores", "Acciones"],
        campos: ["nombre", "ip", "tipo_edicion", "descripcion", "imagen", "jugadores", "anio", "modalidades"],
        camposVisibles: ["nombre", "ip", "tipo_edicion", "descripcion", "imagen", "jugadores", "anio", "modalidades"],
    },
    mods: {
        tabla: "mods",
        titulo: "Mods",
        columnas: ["Imagen", "Nombre", "Versión", "Cargadores", "Acciones"],
        campos: ["nombre", "descripcion", "imagen", "curseforge", "version", "categoria", "cargadores"],
        camposVisibles: ["nombre", "descripcion", "imagen", "curseforge", "version", "categoria", "cargadores"],
    },
    texturas: {
        tabla: "texturas",
        titulo: "Texturas",
        campos: ["nombre", "descripcion", "imagen", "curseforge", "version", "categoria"],
        columnas: ["Imagen", "Nombre", "Versión", "Acciones"],
        camposVisibles: ["nombre", "descripcion", "imagen", "curseforge", "version", "categoria"],
    },
};

let seccionActual = "resumen";
let mostrarRechazados = false;
let cacheActual = [];
let editandoId = null;
let idAEliminar = null;

const SUBTITULOS = {
    resumen: "Un vistazo rápido a todo tu sitio.",
    servidores: "Administra los servidores que se muestran en la web.",
    mods: "Administra los mods disponibles para descargar.",
    texturas: "Administra los packs de texturas disponibles.",
    ia: "Busca en CurseForge y agrega contenido nuevo automáticamente.",
    estadisticas: "Qué se está descargando y cuándo.",
    seguridad: "Bitácora de cambios e intentos de acceso.",
    administradores: "Quién puede entrar al panel.",
    config: "Datos de la cuenta y seguridad del panel.",
};

// ---------- Helpers UI ----------
function $(id) { return document.getElementById(id); }

// Genera el HTML de un ícono de la librería Lucide. Los nombres son
// siempre valores fijos que escribe el propio código (nunca datos
// que vengan de un usuario o de la base de datos), así que no hay
// riesgo de inyección al insertarlos con innerHTML.
function icono(nombre, clase = "") {
    return `<i data-lucide="${nombre}"${clase ? ` class="${clase}"` : ""}></i>`;
}

// Los íconos se insertan como <i data-lucide="..."> y recién se
// convierten en SVG cuando corre lucide.createIcons(). Hay que
// llamarla cada vez que se agrega HTML nuevo con íconos dentro.
//
// Si la librería todavía no cargó (por ejemplo, la CDN tardó más
// que el resto de la página), reintenta unas cuantas veces en vez
// de fallar en silencio y dejar los íconos vacíos para siempre.
function refrescarIconos(intentos = 8) {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
        return;
    }
    if (intentos > 0) {
        setTimeout(() => refrescarIconos(intentos - 1), 250);
    }
}

function toast(mensaje, tipo = "ok") {
    const cont = $("toasts");
    const el = document.createElement("div");
    const nombreIcono = tipo === "ok" ? "check-circle" : "alert-triangle";
    el.className = `toast ${tipo}`;
    el.innerHTML = `<span>${icono(nombreIcono)}</span><span>${escapeHTML(mensaje)}</span>`;
    cont.appendChild(el);
    refrescarIconos();
    setTimeout(() => el.remove(), 3500);
}

function mostrarCampo(id, visible) {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? "flex" : "none";
}

// ---------- Auth gate ----------

// Supabase dispara onAuthStateChange con la sesión actual apenas
// uno se suscribe (evento "INITIAL_SESSION"), y durante un login
// puede disparar varios eventos más (SIGNED_IN, TOKEN_REFRESHED,
// etc.) para lo que en la práctica es un solo inicio de sesión. Si
// no se filtra, cada uno de esos disparos vuelve a correr todo
// manejarSesion() de nuevo: duplica los botones de "Resumen" (se
// vuelven a agregar sin sacar los anteriores) y registra el mismo
// intento de acceso rechazado varias veces. Por eso acá se recuerda
// el último access_token ya procesado y se ignoran repeticiones.
let ultimoTokenProcesado = undefined; // undefined = todavía no procesó ninguno

async function iniciarPanel() {
    refrescarIconos();
    if (!Datos.clienteListo()) {
        $("pantalla-cargando").style.display = "none";
        $("denegado-titulo").textContent = "Supabase no está configurado";
        $("denegado-texto").textContent = "Edita supabase-client.js con tu SUPABASE_URL y SUPABASE_ANON_KEY para activar el panel.";
        $("btn-login-google").style.display = "none";
        $("pantalla-denegado").style.display = "flex";
        return;
    }

    // onAuthStateChange ya entrega la sesión actual apenas se
    // suscribe, así que no hace falta además llamar getSession() a
    // mano (eso era lo que provocaba que la sesión inicial se
    // procesara dos veces).
    supabaseClient.auth.onAuthStateChange((_ev, sesion) => {
        manejarSesion(sesion);
    });
}

// Evita registrar el mismo intento de acceso rechazado más de una
// vez en una ventana corta de tiempo, aunque por algún motivo
// manejarSesion() se vuelva a disparar para el mismo email.
let ultimoIntentoRegistrado = { email: null, ts: 0 };
function registrarIntentoSiCorresponde(email) {
    const ahora = Date.now();
    if (email === ultimoIntentoRegistrado.email && (ahora - ultimoIntentoRegistrado.ts) < 60000) return;
    ultimoIntentoRegistrado = { email, ts: ahora };
    Datos.registrarIntentoAcceso(email);
}

async function manejarSesion(sesion) {
    const token = sesion?.access_token || null;
    if (token && token === ultimoTokenProcesado) return; // ya se procesó esta misma sesión
    ultimoTokenProcesado = token;

    $("pantalla-cargando").style.display = "none";

    const email = sesion?.user?.email || null;

    if (!sesion) {
        sesionAdmin = null;
        $("admin-shell").classList.remove("mostrar");
        $("denegado-titulo").textContent = "Acceso restringido";
        $("denegado-texto").textContent = "Necesitas iniciar sesión con la cuenta de administrador para ver este panel.";
        $("btn-login-google").style.display = "inline-block";
        $("pantalla-denegado").style.display = "flex";
        return;
    }

    const admin = await Datos.obtenerAdmin(email);

    if (!admin && email !== SUPERADMIN_EMERGENCIA) {
        sesionAdmin = null;
        $("admin-shell").classList.remove("mostrar");
        $("denegado-titulo").textContent = "No tienes acceso";
        $("denegado-texto").textContent = `Iniciaste sesión como ${email}, pero este panel es exclusivo para administradores autorizados de Vivandro.`;
        $("btn-login-google").style.display = "none";
        $("pantalla-denegado").style.display = "flex";
        // Deja constancia del intento (RLS solo permite insertar el
        // propio email, así que esto no se puede falsificar).
        registrarIntentoSiCorresponde(email);
        return;
    }

    // Nota: esto solo controla qué se MUESTRA. El servidor (RLS)
    // vuelve a comprobar este mismo email contra la tabla "admins"
    // (o contra SUPERADMIN_EMERGENCIA, ver agregar_tabla_admins.sql)
    // en cada operación de escritura, así que no hay forma de
    // saltarse esto por acá.
    sesionAdmin = { email, esSuperadmin: email === SUPERADMIN_EMERGENCIA || !!admin?.es_superadmin };
    $("pantalla-denegado").style.display = "none";
    $("admin-shell").classList.add("mostrar");

    const nombre = escapeHTML(sesion.user.user_metadata?.full_name || email);
    const foto = sanitizeURL(sesion.user.user_metadata?.avatar_url);
    const avatarHTML = foto ? `<img src="${foto}" alt="">` : `<span class="avatar-generico">${icono("user")}</span>`;

    $("admin-usuario").innerHTML = `${avatarHTML} <span>${nombre}</span>`;
    $("admin-sidebar-perfil").innerHTML = `${avatarHTML}<div class="quien"><div class="nombre">${nombre}</div><div class="rol">${sesionAdmin.esSuperadmin ? "Superadministrador" : "Administrador"}</div></div>`;
    $("btn-avatar-movil").innerHTML = avatarHTML;
    refrescarIconos();

    iniciarVigilanciaInactividad();
    cambiarSeccion(seccionActual);
}

$("btn-login-google").addEventListener("click", async () => {
    await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.href },
    });
});

$("btn-logout").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
});

// ---------- Configuración: mostrar/ocultar el email del admin ----------
function ocultarEmail(email) {
    const [usuario, dominio] = email.split("@");
    if (!dominio) return "••••••••";
    const visible = usuario.slice(0, Math.min(3, usuario.length));
    return `${visible}${"•".repeat(8)}@${dominio}`;
}
$("btn-mostrar-email").addEventListener("click", () => {
    if (!sesionAdmin) return;
    const visible = $("config-email").textContent === sesionAdmin.email;
    $("config-email").textContent = visible ? ocultarEmail(sesionAdmin.email) : sesionAdmin.email;
    $("btn-mostrar-email").innerHTML = visible
        ? `${icono("eye")} <span class="txt">Mostrar</span>`
        : `${icono("eye-off")} <span class="txt">Ocultar</span>`;
    refrescarIconos();
});

// ---------- Menú móvil (drawer) ----------
function abrirDrawer() {
    $("admin-sidebar").classList.add("abierto");
    $("drawer-backdrop").classList.add("activo");
}
function cerrarDrawer() {
    $("admin-sidebar").classList.remove("abierto");
    $("drawer-backdrop").classList.remove("activo");
}
$("btn-abrir-drawer").addEventListener("click", abrirDrawer);
$("drawer-backdrop").addEventListener("click", cerrarDrawer);
$("btn-avatar-movil").addEventListener("click", abrirDrawer);

// ---------- Modo oscuro (comparte preferencia con el resto del sitio) ----------
const TEMA_KEY = "vivandro-theme";
function aplicarTema(tema) {
    document.documentElement.classList.toggle("dark-mode", tema === "dark");
    const btn = $("theme-toggle");
    if (btn) {
        btn.innerHTML = tema === "dark"
            ? `${icono("sun")}<span class="txt">Modo claro</span>`
            : `${icono("moon")}<span class="txt">Modo oscuro</span>`;
        refrescarIconos();
    }
}
aplicarTema(localStorage.getItem(TEMA_KEY) || "dark");
$("theme-toggle").addEventListener("click", () => {
    const esOscuro = document.documentElement.classList.contains("dark-mode");
    const nuevo = esOscuro ? "light" : "dark";
    localStorage.setItem(TEMA_KEY, nuevo);
    aplicarTema(nuevo);
    if (seccionActual === "estadisticas") cargarEstadisticas();
    if (seccionActual === "resumen") cargarResumen();
});

// ---------- Navegación de secciones ----------
document.querySelectorAll(".admin-nav button").forEach((btn) => {
    btn.addEventListener("click", () => {
        cambiarSeccion(btn.dataset.seccion);
        cerrarDrawer();
    });
});

function cambiarSeccion(id) {
    seccionActual = id;
    document.querySelectorAll(".admin-nav button").forEach((b) => {
        b.classList.toggle("activo", b.dataset.seccion === id);
    });

    $("vista-resumen").style.display = "none";
    $("vista-config").style.display = "none";
    $("vista-lista").style.display = "none";
    $("vista-estadisticas").style.display = "none";
    $("vista-seguridad").style.display = "none";
    $("vista-administradores").style.display = "none";
    $("vista-ia").style.display = "none";
    $("subtitulo-seccion").textContent = SUBTITULOS[id] || "";

    // El toggle "Ver rechazados" solo aplica a mods/texturas (las
    // únicas tablas con columna "estado"); se resetea a apagado cada
    // vez que se entra a la sección.
    mostrarRechazados = false;
    const toggleWrap = $("toggle-rechazados-wrap");
    if (toggleWrap) {
        toggleWrap.style.display = (id === "mods" || id === "texturas") ? "flex" : "none";
        $("toggle-rechazados").checked = false;
    }

    if (id === "resumen") {
        $("titulo-seccion").textContent = "Resumen";
        $("vista-resumen").style.display = "block";
        $("stats-grid").innerHTML = "";
        cargarResumen();
        return;
    }

    if (id === "seguridad") {
        $("titulo-seccion").textContent = "Seguridad";
        $("vista-seguridad").style.display = "block";
        $("stats-grid").innerHTML = "";
        cargarSeguridad();
        return;
    }

    if (id === "config") {
        $("titulo-seccion").textContent = "Configuración";
        $("vista-config").style.display = "block";
        $("stats-grid").innerHTML = "";
        if (sesionAdmin) $("config-email").textContent = ocultarEmail(sesionAdmin.email);
        $("btn-mostrar-email").innerHTML = `${icono("eye")} <span class="txt">Mostrar</span>`;
        refrescarIconos();
        return;
    }

    if (id === "administradores") {
        $("titulo-seccion").textContent = "Administradores";
        $("vista-administradores").style.display = "block";
        $("stats-grid").innerHTML = "";
        cargarAdministradores();
        return;
    }

    if (id === "ia") {
        $("titulo-seccion").textContent = "Generador IA";
        $("vista-ia").style.display = "block";
        $("stats-grid").innerHTML = "";
        cargarPendientesIA();
        return;
    }

    if (id === "estadisticas") {
        $("titulo-seccion").textContent = "Estadísticas de descargas";
        $("vista-estadisticas").style.display = "block";
        $("stats-grid").innerHTML = "";
        $("stats-tabla-buscar").value = "";
        statsTablaBusqueda = "";
        iniciarEstadisticas();
        return;
    }

    $("vista-lista").style.display = "block";
    $("titulo-seccion").textContent = SECCIONES[id].titulo;
    $("buscar-input").value = "";
    cargarSeccion();
}

function tarjetaStat(nombreIcono, num, label) {
    return `<div class="stat-card">
        <div class="stat-top"><div class="stat-ico">${icono(nombreIcono)}</div></div>
        <div class="num">${num}</div>
        <div class="label">${label}</div>
    </div>`;
}

async function cargarStats() {
    const [servidores, mods, texturas] = await Promise.all([
        Datos.listar("servidores"),
        Datos.listar("mods"),
        Datos.listar("texturas"),
    ]);
    $("stats-grid").innerHTML =
        tarjetaStat("server", servidores.length, "Servidores") +
        tarjetaStat("puzzle", mods.length, "Mods") +
        tarjetaStat("palette", texturas.length, "Texturas");
    refrescarIconos();
}

// ---------- Resumen (dashboard) ----------
let graficoResumen = null;
let resumenCargaId = 0; // evita que una carga vieja pise/duplique el resultado de una más nueva

function botonAccionRapida(nombreIcono, titulo, sub, onClick) {
    const btn = document.createElement("button");
    btn.className = "accion-rapida";
    btn.innerHTML = `<div class="ico">${icono(nombreIcono)}</div><div class="txt"><strong>${titulo}</strong><span>${sub}</span></div>`;
    btn.addEventListener("click", onClick);
    return btn;
}

async function cargarResumen() {
    const miCarga = ++resumenCargaId;

    $("resumen-stats").innerHTML = `<div class="vacio">Cargando…</div>`;
    $("resumen-acciones").innerHTML = "";
    $("resumen-top-lista").innerHTML = "";

    const [servidores, mods, texturas] = await Promise.all([
        Datos.listar("servidores"),
        Datos.listar("mods"),
        Datos.listar("texturas"),
    ]);
    if (miCarga !== resumenCargaId) return; // se pidió otra carga más nueva mientras esperábamos

    let descargas30 = [];
    try {
        descargas30 = await Datos.listarDescargas({ desde: fechaDesdeRango(30) });
    } catch (e) { /* la tabla de descargas puede no existir aún; no rompe el resto del panel */ }
    if (miCarga !== resumenCargaId) return;

    $("resumen-stats").innerHTML =
        tarjetaStat("server", servidores.length, "Servidores publicados") +
        tarjetaStat("puzzle", mods.length, "Mods disponibles") +
        tarjetaStat("palette", texturas.length, "Texturas disponibles") +
        tarjetaStat("download", descargas30.length, "Descargas (30 días)");

    // Acciones rápidas
    const acciones = $("resumen-acciones");
    acciones.appendChild(botonAccionRapida("server", "Nuevo servidor", "Agregar a la lista", () => { cambiarSeccion("servidores"); abrirForm(); }));
    acciones.appendChild(botonAccionRapida("puzzle", "Nuevo mod", "Agregar a la lista", () => { cambiarSeccion("mods"); abrirForm(); }));
    acciones.appendChild(botonAccionRapida("palette", "Nueva textura", "Agregar a la lista", () => { cambiarSeccion("texturas"); abrirForm(); }));
    acciones.appendChild(botonAccionRapida("bar-chart-3", "Ver estadísticas", "Descargas completas", () => cambiarSeccion("estadisticas")));
    refrescarIconos();

    // Índice id -> nombre/tipo para el top de descargados
    const itemsPorIdLocal = {};
    mods.forEach((m) => (itemsPorIdLocal[m.id] = { nombre: m.nombre, tipo: "Mod" }));
    texturas.forEach((t) => (itemsPorIdLocal[t.id] = { nombre: t.nombre, tipo: "Textura" }));

    const conteo = {};
    descargas30.forEach((d) => (conteo[d.item_id] = (conteo[d.item_id] || 0) + 1));
    const top5 = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (top5.length === 0) {
        $("resumen-top-lista").innerHTML = `<div class="vacio"><span class="vacio-ico">${icono("inbox")}</span>Todavía no hay descargas este mes.</div>`;
        refrescarIconos();
    } else {
        $("resumen-top-lista").innerHTML = top5.map(([id, cant], i) => {
            const info = itemsPorIdLocal[id] || { nombre: "(eliminado)", tipo: "—" };
            return `<li>
                <div class="rank">${i + 1}</div>
                <div class="info"><div class="n">${escapeHTML(info.nombre)}</div><div class="t">${info.tipo}</div></div>
                <div class="cant">${cant}</div>
            </li>`;
        }).join("");
    }

    // Gráfico de descargas por día (30 días)
    const porDia = {};
    descargas30.forEach((d) => {
        const dia = d.creado_en.slice(0, 10);
        porDia[dia] = (porDia[dia] || 0) + 1;
    });
    const dias = Object.keys(porDia).sort();
    const canvas = $("resumen-grafico");

    $("resumen-grafico-vacio").style.display = dias.length === 0 ? "block" : "none";
    canvas.style.display = dias.length === 0 ? "none" : "block";

    if (graficoResumen) { graficoResumen.destroy(); graficoResumen = null; }

    if (dias.length > 0 && window.Chart) {
        const oscuro = document.documentElement.classList.contains("dark-mode");
        graficoResumen = new Chart(canvas.getContext("2d"), {
            type: "line",
            data: {
                labels: dias,
                datasets: [{
                    label: "Descargas",
                    data: dias.map((d) => porDia[d]),
                    borderColor: "#9801ac",
                    backgroundColor: "rgba(152,1,172,.15)",
                    fill: true,
                    tension: .3,
                    pointRadius: 3,
                }],
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0, color: oscuro ? "#b6a6bd" : "#6b6270" }, grid: { color: oscuro ? "#3a2242" : "#e7e1ec" } },
                    x: { ticks: { color: oscuro ? "#b6a6bd" : "#6b6270" }, grid: { display: false } },
                },
            },
        });
    }
}

// ---------- Seguridad (bitácora + intentos de acceso) ----------
const ETIQUETA_ACCION = { crear: ["plus-circle", "creó"], actualizar: ["edit-3", "editó"], eliminar: ["trash-2", "eliminó"] };
const ETIQUETA_TABLA = { servidores: "servidor", mods: "mod", texturas: "textura" };

function tiempoRelativo(fechaISO) {
    const diffMs = Date.now() - new Date(fechaISO).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return "recién";
    if (min < 60) return `hace ${min} min`;
    const horas = Math.floor(min / 60);
    if (horas < 24) return `hace ${horas} h`;
    const dias = Math.floor(horas / 24);
    return `hace ${dias} d`;
}

async function cargarSeguridad() {
    $("seguridad-stats").innerHTML = `<div class="vacio">Cargando…</div>`;
    $("seguridad-bitacora").innerHTML = "";
    $("seguridad-intentos").innerHTML = "";

    const [bitacora, intentos] = await Promise.all([
        Datos.listarBitacora(30),
        Datos.listarIntentosAcceso(30),
    ]);

    const ultimos7dias = (arr) => arr.filter((f) => Date.now() - new Date(f.creado_en).getTime() < 7 * 24 * 3600 * 1000).length;

    $("seguridad-stats").innerHTML =
        tarjetaStat("history", ultimos7dias(bitacora), "Cambios (7 días)") +
        tarjetaStat("shield-alert", ultimos7dias(intentos), "Accesos rechazados (7 días)") +
        tarjetaStat("lock", "RLS", "Protección activa en Supabase");

    if (bitacora.length === 0) {
        $("seguridad-bitacora").innerHTML = `<div class="vacio"><span class="vacio-ico">${icono("inbox")}</span>Sin actividad registrada todavía.<br><small>Corre <code>mejoras_seguridad_backend.sql</code> si es la primera vez.</small></div>`;
    } else {
        $("seguridad-bitacora").innerHTML = bitacora.map((f) => {
            const [ico, verbo] = ETIQUETA_ACCION[f.accion] || ["circle", f.accion];
            const tabla = ETIQUETA_TABLA[f.tabla] || f.tabla;
            return `<li>
                <div class="rank">${icono(ico)}</div>
                <div class="info"><div class="n">${escapeHTML(f.admin_email)} ${verbo} un ${tabla}</div><div class="t">${tiempoRelativo(f.creado_en)}</div></div>
            </li>`;
        }).join("");
    }

    if (intentos.length === 0) {
        $("seguridad-intentos").innerHTML = `<div class="vacio"><span class="vacio-ico">${icono("check-circle")}</span>Ningún intento sospechoso registrado.</div>`;
    } else {
        $("seguridad-intentos").innerHTML = intentos.map((f) => `<li>
            <div class="rank" style="background:var(--admin-error-soft);color:var(--admin-error);">${icono("alert-triangle")}</div>
            <div class="info"><div class="n">${escapeHTML(f.email)}</div><div class="t">${tiempoRelativo(f.creado_en)}</div></div>
        </li>`).join("");
    }
    refrescarIconos();
}

// ---------- Administradores autorizados ----------
async function cargarAdministradores() {
    const wrapAgregar = $("administradores-agregar-wrap");
    const lista = $("administradores-lista");

    // Autorizar (o quitar) administradores es exclusivo de un
    // superadmin. El servidor (RLS sobre la tabla "admins") lo
    // vuelve a exigir igual, así que esconder el formulario acá es
    // solo para no confundir a un admin normal con un botón que de
    // todas formas le va a fallar.
    wrapAgregar.style.display = sesionAdmin?.esSuperadmin ? "block" : "none";

    lista.innerHTML = `<div class="vacio">Cargando…</div>`;
    const admins = await Datos.listarAdmins();

    if (admins.length === 0) {
        lista.innerHTML = `<div class="vacio"><span class="vacio-ico">${icono("inbox")}</span>No se encontraron administradores.</div>`;
        refrescarIconos();
        return;
    }

    lista.innerHTML = admins.map((a) => {
        const esYo = a.email === sesionAdmin?.email;
        const puedeQuitar = sesionAdmin?.esSuperadmin && !esYo;
        return `<li>
            <div class="rank">${icono("user")}</div>
            <div class="info"><div class="n">${escapeHTML(a.email)}</div><div class="t">Autorizado ${tiempoRelativo(a.creado_en)}</div></div>
            ${a.es_superadmin ? `<span class="chip-superadmin">Superadmin</span>` : ""}
            ${esYo ? `<span class="chip-tu">Tú</span>` : ""}
            ${puedeQuitar ? `<button type="button" class="btn-icono eliminar" data-quitar-admin="${escapeHTML(a.email)}" title="Quitar acceso"><i data-lucide="user-x"></i></button>` : ""}
        </li>`;
    }).join("");
    refrescarIconos();

    lista.querySelectorAll("[data-quitar-admin]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const email = btn.dataset.quitarAdmin;
            if (!confirm(`¿Quitar el acceso de ${email} al panel de administración?`)) return;
            try {
                await Datos.eliminarAdmin(email);
                toast("Acceso quitado.");
                cargarAdministradores();
            } catch (e) {
                toast("No se pudo quitar el acceso. " + (e.message || ""), "error");
            }
        });
    });
}

$("form-administradores").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const input = $("campo-admin-email");
    const email = input.value.trim().toLowerCase();
    $("aviso-admin-duplicado").style.display = "none";
    if (!email) return;

    const btn = $("btn-agregar-admin");
    btn.disabled = true;
    try {
        await Datos.agregarAdmin(email);
        toast(`${email} ahora puede entrar al panel.`);
        input.value = "";
        cargarAdministradores();
    } catch (e) {
        // Violación de la llave primaria (email ya existe en la tabla).
        if (e.code === "23505" || /duplicate|unique/i.test(e.message || "")) {
            $("aviso-admin-duplicado").style.display = "block";
            refrescarIconos();
        } else {
            toast("No se pudo autorizar el correo. " + (e.message || ""), "error");
        }
    } finally {
        btn.disabled = false;
    }
});

// ---------- Cierre de sesión automático por inactividad ----------
const MINUTOS_INACTIVIDAD = 30;
let temporizadorInactividad = null;

function iniciarVigilanciaInactividad() {
    const reiniciar = () => {
        clearTimeout(temporizadorInactividad);
        temporizadorInactividad = setTimeout(async () => {
            toast("Sesión cerrada por inactividad.", "error");
            await supabaseClient.auth.signOut();
        }, MINUTOS_INACTIVIDAD * 60 * 1000);
    };
    ["click", "keydown", "scroll", "mousemove", "touchstart"].forEach((ev) =>
        document.addEventListener(ev, reiniciar, { passive: true })
    );
    reiniciar();
}


async function cargarSeccion() {
    const conf = SECCIONES[seccionActual];
    $("tabla-body").innerHTML = `<tr><td colspan="6" class="vacio">Cargando…</td></tr>`;
    $("tabla-vacio").style.display = "none";
    $("tabla-head").innerHTML = `<tr>${conf.columnas.map((c) => `<th>${c}</th>`).join("")}</tr>`;

    try {
        const todos = await Datos.listar(conf.tabla);
        // Los "rechazados" por el Generador IA se guardan (no se borran)
        // para que el generador no los vuelva a sugerir. Por defecto se
        // ocultan de esta lista; el toggle "Ver rechazados" los muestra
        // para poder revisarlos o borrarlos definitivamente.
        cacheActual = mostrarRechazados ? todos : todos.filter((item) => item.estado !== "rechazado");
        pintarTabla(cacheActual);
    } catch (e) {
        toast("Error cargando datos: " + e.message, "error");
    }
    cargarStats();
}

function pintarTabla(items) {
    const conf = SECCIONES[seccionActual];
    const cuerpo = $("tabla-body");

    if (items.length === 0) {
        cuerpo.innerHTML = "";
        $("tabla-vacio").style.display = "block";
        return;
    }
    $("tabla-vacio").style.display = "none";

    cuerpo.innerHTML = items.map((item) => {
        const esServidor = seccionActual === "servidores";
        // La tabla "servidores" guarda la imagen en la columna "logo";
        // "mods" y "texturas" la guardan en "imagen".
        const img = sanitizeURL(esServidor ? item.logo : item.imagen) || "imagenes/logo.png";
        const nombre = escapeHTML(item.nombre);
        if (esServidor) {
            return `<tr>
                <td><img class="miniatura" src="${img}" alt="" onerror="this.src='imagenes/logo.png'"></td>
                <td>${nombre}</td>
                <td>${escapeHTML(item.ip || "")}</td>
                <td><span class="pill ${item.tipo_edicion === "bedrock" ? "bedrock" : "java"}">${item.tipo_edicion === "bedrock" ? "Bedrock" : "Java"}</span></td>
                <td>${escapeHTML(item.jugadores_promedio || "")}</td>
                <td class="acciones-fila">
                    <button class="btn-icono editar" data-id="${item.id}">${icono("edit-3")} <span class="txt">Editar</span></button>
                    <button class="btn-icono eliminar" data-id="${item.id}">${icono("trash-2")} <span class="txt">Eliminar</span></button>
                </td>
            </tr>`;
        }
        const pendiente = item.estado === "pendiente";
        const rechazado = item.estado === "rechazado";
        return `<tr>
            <td><img class="miniatura" src="${img}" alt="" onerror="this.src='imagenes/logo.png'"></td>
            <td>${nombre} ${pendiente ? `<span class="pill pendiente">${icono("clock")} Pendiente</span>` : ""}${rechazado ? `<span class="pill rechazado">${icono("x")} Rechazado</span>` : ""}</td>
            <td>${item.version_minecraft ? `<span class="pill neutro">${escapeHTML(item.version_minecraft)}</span>` : "—"}</td>
            ${seccionActual === "mods" ? `<td>${(item.cargadores || []).length ? (item.cargadores || []).map((c) => `<span class="pill neutro">${escapeHTML(c)}</span>`).join(" ") : "—"}</td>` : ""}
            <td class="acciones-fila">
                ${pendiente ? `<button class="btn-icono publicar" data-id="${item.id}">${icono("check")} <span class="txt">Publicar</span></button>` : ""}
                ${rechazado ? `<button class="btn-icono restaurar" data-id="${item.id}">${icono("rotate-ccw")} <span class="txt">Restaurar</span></button>` : ""}
                <button class="btn-icono editar" data-id="${item.id}">${icono("edit-3")} <span class="txt">Editar</span></button>
                <button class="btn-icono eliminar" data-id="${item.id}">${icono("trash-2")} <span class="txt">Eliminar</span></button>
            </td>
        </tr>`;
    }).join("");

    refrescarIconos();
    cuerpo.querySelectorAll(".editar").forEach((b) => b.addEventListener("click", () => abrirForm(b.dataset.id)));
    cuerpo.querySelectorAll(".eliminar").forEach((b) => b.addEventListener("click", () => abrirConfirmar(b.dataset.id)));
    cuerpo.querySelectorAll(".publicar").forEach((b) => b.addEventListener("click", () => publicarItem(b.dataset.id)));
    cuerpo.querySelectorAll(".restaurar").forEach((b) => b.addEventListener("click", () => restaurarItem(b.dataset.id)));
}

// Devuelve un mod/textura rechazado a "pendiente", por si se rechazó
// por error y se quiere volver a revisar desde "Pendientes de revisión".
async function restaurarItem(id) {
    const conf = SECCIONES[seccionActual];
    try {
        await Datos.actualizar(conf.tabla, id, { estado: "pendiente" });
        toast("Restaurado a pendiente de revisión.");
        cargarSeccion();
    } catch (err) {
        toast("No se pudo restaurar: " + (err.message || "error desconocido"), "error");
    }
}

// Aprueba un mod/textura generado por la IA (o cualquier ítem marcado
// "pendiente"): lo pasa a "publicado" para que aparezca en el sitio.
async function publicarItem(id) {
    const conf = SECCIONES[seccionActual];
    try {
        await Datos.actualizar(conf.tabla, id, { estado: "publicado" });
        toast("Publicado. Ya aparece en el sitio.");
        cargarSeccion();
    } catch (err) {
        toast("No se pudo publicar: " + (err.message || "error desconocido"), "error");
    }
}

$("buscar-input").addEventListener("input", (e) => {
    const texto = e.target.value.trim().toLowerCase();
    const filtrados = cacheActual.filter((it) => (it.nombre || "").toLowerCase().includes(texto));
    pintarTabla(filtrados);
});

$("toggle-rechazados").addEventListener("change", (e) => {
    mostrarRechazados = e.target.checked;
    cargarSeccion();
});

// ---------- Modal crear/editar ----------
function camposDeSeccion() {
    const esServidor = seccionActual === "servidores";
    const esMod = seccionActual === "mods";
    mostrarCampo("campo-ip-wrap", esServidor);
    mostrarCampo("campo-tipo-edicion-wrap", esServidor);
    mostrarCampo("campo-jugadores-wrap", esServidor);
    mostrarCampo("campo-anio-wrap", esServidor);
    mostrarCampo("campo-modalidades-wrap", esServidor);
    mostrarCampo("campo-curseforge-wrap", !esServidor);
    mostrarCampo("campo-version-wrap", true);
    mostrarCampo("campo-categoria-wrap", !esServidor);
    // Los cargadores (Forge/NeoForge/Fabric) y los requisitos solo
    // aplican a mods: una textura o un servidor no dependen de un
    // mod loader ni de otro mod para instalarse.
    mostrarCampo("campo-cargadores-wrap", esMod);
    mostrarCampo("campo-requisitos-wrap", esMod);
    $("campo-curseforge").required = !esServidor;
}

function limpiarForm() {
    $("form-item").reset();
    editandoId = null;
    ocultarAvisoDuplicado();
}

// ---------- Validación de nombres duplicados (mods y texturas) ----------
// Antes de guardar comprobamos, con lo que ya está cargado en pantalla
// (cacheActual), si otro registro de la misma sección tiene el mismo
// nombre sin importar mayúsculas/minúsculas ("OptiFine" === "optifine").
// Esto da una respuesta instantánea mientras se escribe. La base de
// datos (ver agregar_validacion_duplicados_mods_texturas.sql) tiene un
// índice único que hace de última palabra real, por si dos personas
// guardan al mismo tiempo desde dos pestañas distintas.
function mensajeDuplicado(tabla) {
    return tabla === "mods"
        ? "Este mod ya existe en la base de datos."
        : "Esta textura ya existe en la base de datos.";
}

function nombreDuplicado(tabla, nombre, idActual) {
    if (tabla !== "mods" && tabla !== "texturas") return false;
    const normalizado = (nombre || "").trim().toLowerCase();
    if (!normalizado) return false;
    return cacheActual.some(
        (it) => String(it.id) !== String(idActual) && (it.nombre || "").trim().toLowerCase() === normalizado
    );
}

function mostrarAvisoDuplicado(tabla) {
    $("campo-nombre").classList.add("campo-invalido");
    const aviso = $("aviso-nombre-duplicado");
    aviso.innerHTML = `${icono("alert-triangle")} <span>${escapeHTML(mensajeDuplicado(tabla))}</span>`;
    aviso.style.display = "flex";
    refrescarIconos();
}

function ocultarAvisoDuplicado() {
    $("campo-nombre").classList.remove("campo-invalido");
    $("aviso-nombre-duplicado").style.display = "none";
}

$("campo-nombre").addEventListener("input", () => {
    if (seccionActual !== "mods" && seccionActual !== "texturas") return;
    if (nombreDuplicado(seccionActual, $("campo-nombre").value, editandoId)) {
        mostrarAvisoDuplicado(seccionActual);
    } else {
        ocultarAvisoDuplicado();
    }
});

function abrirForm(id = null) {
    camposDeSeccion();
    limpiarForm();
    $("modal-form-titulo").textContent = id ? `Editar ${SECCIONES[seccionActual].titulo.slice(0, -1) || SECCIONES[seccionActual].titulo}` : `Agregar ${SECCIONES[seccionActual].titulo}`;

    if (id) {
        editandoId = id;
        const item = cacheActual.find((x) => String(x.id) === String(id));
        if (item) {
            $("campo-nombre").value = item.nombre || "";
            $("campo-descripcion").value = item.descripcion || "";
            // Igual que en la tabla: "servidores" usa la columna "logo",
            // "mods"/"texturas" usan "imagen".
            $("campo-imagen").value = (seccionActual === "servidores" ? item.logo : item.imagen) || "";
            if (seccionActual === "servidores") {
                $("campo-ip").value = item.ip || "";
                $("campo-tipo-edicion").value = item.tipo_edicion || "java";
                $("campo-jugadores").value = item.jugadores_promedio || "";
                $("campo-anio").value = item.anio_creacion || "";
                $("campo-modalidades").value = (item.modalidades || []).join(", ");
            } else {
                $("campo-curseforge").value = item.curseforge_url || "";
                $("campo-version").value = item.version_minecraft || "";
                $("campo-categoria").value = item.categoria || "";
                if (seccionActual === "mods") {
                    const cargadores = item.cargadores || [];
                    $("campo-cargador-forge").checked = cargadores.includes("Forge");
                    $("campo-cargador-neoforge").checked = cargadores.includes("NeoForge");
                    $("campo-cargador-fabric").checked = cargadores.includes("Fabric");

                    const requisitos = Array.isArray(item.requisitos) ? item.requisitos : [];
                    document.querySelectorAll("#requisitos-lista .requisito-fila").forEach((fila, i) => {
                        const req = requisitos[i];
                        fila.querySelector(".req-nombre").value = req?.nombre || "";
                        fila.querySelector(".req-url").value = req?.url || "";
                    });
                }
            }
        }
    }

    $("modal-form").classList.add("activo");
}

function cerrarForm() {
    $("modal-form").classList.remove("activo");
    limpiarForm();
}

$("btn-nuevo").addEventListener("click", () => abrirForm());
$("btn-cancelar-form").addEventListener("click", cerrarForm);
$("modal-form-cerrar").addEventListener("click", cerrarForm);

$("form-item").addEventListener("submit", async (e) => {
    e.preventDefault();
    const conf = SECCIONES[seccionActual];

    const urlImagen = sanitizeURL($("campo-imagen").value.trim());
    if ($("campo-imagen").value.trim() && !urlImagen) {
        toast("La URL de imagen no es válida (debe empezar con http/https).", "error");
        return;
    }

    let registro = {
        nombre: $("campo-nombre").value.trim(),
        descripcion: $("campo-descripcion").value.trim(),
    };

    // Bloqueo de nombres duplicados (mods y texturas), sin distinguir
    // mayúsculas/minúsculas. Se repite acá (además del chequeo mientras
    // se escribe) por si el campo nunca disparó el evento "input", por
    // ejemplo si se pega el nombre justo antes de enviar el formulario.
    if (nombreDuplicado(seccionActual, registro.nombre, editandoId)) {
        mostrarAvisoDuplicado(seccionActual);
        toast(mensajeDuplicado(seccionActual), "error");
        return;
    }

    if (seccionActual === "servidores") {
        // En la tabla "servidores" la columna se llama "logo", no "imagen".
        registro.logo = urlImagen;
        registro.ip = $("campo-ip").value.trim();
        registro.tipo_edicion = $("campo-tipo-edicion").value === "bedrock" ? "bedrock" : "java";
        registro.jugadores_promedio = $("campo-jugadores").value.trim();
        registro.anio_creacion = $("campo-anio").value ? Number($("campo-anio").value) : null;
        registro.modalidades = $("campo-modalidades").value
            .split(",").map((s) => s.trim()).filter(Boolean);
    } else {
        registro.imagen = urlImagen;
        const urlCF = sanitizeURL($("campo-curseforge").value.trim());
        if (!urlCF) {
            toast("El link de CurseForge no es válido.", "error");
            return;
        }
        registro.curseforge_url = urlCF;
        registro.version_minecraft = $("campo-version").value.trim();
        registro.categoria = $("campo-categoria").value.trim();
        if (seccionActual === "mods") {
            registro.cargadores = ["forge", "neoforge", "fabric"]
                .map((id) => $(`campo-cargador-${id}`))
                .filter((el) => el && el.checked)
                .map((el) => el.value);

            // Requisitos: hasta 4 filas de { nombre, url }. Se ignoran
            // las filas vacías; si alguien completa el nombre pero deja
            // la URL vacía (o al revés) se avisa en vez de guardar algo
            // a medias, y toda URL pasa por sanitizeURL() igual que el
            // resto de los links del formulario.
            const requisitos = [];
            for (const fila of document.querySelectorAll("#requisitos-lista .requisito-fila")) {
                const nombreReq = fila.querySelector(".req-nombre").value.trim();
                const urlReqCruda = fila.querySelector(".req-url").value.trim();
                if (!nombreReq && !urlReqCruda) continue;
                const urlReq = sanitizeURL(urlReqCruda);
                if (!nombreReq || !urlReq) {
                    toast("Cada requisito necesita un nombre y un link válido (o deja ambos vacíos).", "error");
                    return;
                }
                requisitos.push({ nombre: nombreReq, url: urlReq });
            }
            registro.requisitos = requisitos.slice(0, 4);
        }
    }

    const btn = $("btn-guardar-form");
    btn.disabled = true;
    btn.textContent = "Guardando…";

    try {
        if (editandoId) {
            await Datos.actualizar(conf.tabla, editandoId, registro);
            toast("Cambios guardados.");
        } else {
            await Datos.crear(conf.tabla, registro);
            toast("Elemento agregado.");
        }
        cerrarForm();
        cargarSeccion();
    } catch (err) {
        // La base de datos es la última palabra sobre duplicados (índice
        // único case-insensitive, ver agregar_validacion_duplicados_mods_
        // texturas.sql): si dos personas guardan el mismo nombre casi al
        // mismo tiempo, una de las dos va a chocar acá aunque el chequeo
        // en pantalla no lo haya detectado. Postgres devuelve el código
        // "23505" (unique_violation) en ese caso, tanto si lo lanza el
        // índice como si lo lanza el trigger con el mensaje ya en español.
        const esDuplicado = err?.code === "23505" || /ya existe en la base de datos|duplicate key|unique constraint/i.test(err?.message || "");
        if (esDuplicado && (seccionActual === "mods" || seccionActual === "texturas")) {
            mostrarAvisoDuplicado(seccionActual);
            toast(mensajeDuplicado(seccionActual), "error");
        } else {
            toast("No se pudo guardar: " + (err.message || "error desconocido"), "error");
        }
    } finally {
        btn.disabled = false;
        btn.textContent = "Guardar";
    }
});

// ---------- Confirmar eliminar ----------
function abrirConfirmar(id) {
    idAEliminar = id;
    const item = cacheActual.find((x) => String(x.id) === String(id));
    $("confirmar-texto").textContent = item
        ? `Vas a eliminar "${item.nombre}". Esta acción no se puede deshacer.`
        : "Esta acción no se puede deshacer.";
    $("modal-confirmar").classList.add("activo");
}

$("btn-confirmar-no").addEventListener("click", () => {
    idAEliminar = null;
    $("modal-confirmar").classList.remove("activo");
});

$("btn-confirmar-si").addEventListener("click", async () => {
    if (!idAEliminar) return;
    const conf = SECCIONES[seccionActual];
    try {
        await Datos.eliminar(conf.tabla, idAEliminar);
        toast("Elemento eliminado.");
        cargarSeccion();
    } catch (err) {
        toast("No se pudo eliminar: " + (err.message || "error desconocido"), "error");
    } finally {
        idAEliminar = null;
        $("modal-confirmar").classList.remove("activo");
    }
});

// ---------- Estadísticas de descargas ----------
let graficoDescargas = null;
let estadisticasListasParaFiltros = false;
let itemsPorId = {}; // id -> { nombre, tipo }

// Estado del combo buscable que reemplaza al <select> de ítems: la
// lista de opciones vigente (ya filtrada por "Solo Mods"/"Solo Texturas")
// y si el panel desplegable está abierto.
let comboItemOpciones = []; // [{ id, nombre, tipo }]
let comboItemAbierto = false;

// Cache de las filas ya calculadas para la tabla de "Descargas por
// ítem" y el texto de búsqueda vigente. Guardarlas aparte permite que
// escribir en el buscador solo filtre en memoria, sin volver a pedir
// los datos a Supabase ni recalcular nada.
let statsTablaFilas = []; // [{ id, nombre, tipo, cantidad }]
let statsTablaBusqueda = "";

async function iniciarEstadisticas() {
    if (!estadisticasListasParaFiltros) {
        const [mods, texturas] = await Promise.all([
            Datos.listar("mods"),
            Datos.listar("texturas"),
        ]);
        itemsPorId = {};
        mods.forEach((m) => (itemsPorId[m.id] = { nombre: m.nombre, tipo: "mods" }));
        texturas.forEach((t) => (itemsPorId[t.id] = { nombre: t.nombre, tipo: "texturas" }));

        $("stats-tipo").addEventListener("change", () => {
            poblarSelectorItems();
            cargarEstadisticas();
        });
        $("stats-rango").addEventListener("change", cargarEstadisticas);

        // Combo buscable de ítems (reemplaza el <select> nativo en pantalla,
        // pero sigue guardando el valor elegido en el <select id="stats-item">
        // oculto para no tener que tocar el resto de la lógica).
        $("stats-item-disparador").addEventListener("click", (e) => {
            e.stopPropagation();
            comboItemAbierto ? cerrarComboItem() : abrirComboItem();
        });
        $("stats-item-buscar").addEventListener("click", (e) => e.stopPropagation());
        $("stats-item-buscar").addEventListener("input", (e) => renderListaComboItem(e.target.value));
        $("stats-item-buscar").addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                cerrarComboItem();
                $("stats-item-disparador").focus();
            }
        });
        document.addEventListener("click", (e) => {
            if (comboItemAbierto && !$("stats-item-combo").contains(e.target)) cerrarComboItem();
        });

        // Buscador de la tabla "Descargas por ítem": filtra en tiempo real
        // sobre los datos ya cargados, sin volver a pedirlos al servidor.
        $("stats-tabla-buscar").addEventListener("input", (e) => {
            statsTablaBusqueda = e.target.value;
            pintarTablaEstadisticas();
        });

        estadisticasListasParaFiltros = true;
    }
    poblarSelectorItems();
    cargarEstadisticas();
}

function poblarSelectorItems() {
    const tipoFiltro = $("stats-tipo").value;
    const select = $("stats-item");
    const valorActual = select.value;
    select.innerHTML = `<option value="">Todos los ítems</option>`;

    comboItemOpciones = Object.entries(itemsPorId)
        .filter(([, info]) => !tipoFiltro || info.tipo === tipoFiltro)
        .map(([id, info]) => ({ id, nombre: info.nombre, tipo: info.tipo }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));

    comboItemOpciones.forEach((op) => {
        const opt = document.createElement("option");
        opt.value = op.id;
        opt.textContent = `${op.nombre} (${op.tipo === "mods" ? "Mod" : "Textura"})`;
        select.appendChild(opt);
    });

    // Si el ítem seleccionado ya no existe en la nueva lista filtrada, lo deselecciona
    select.value = [...select.options].some((o) => o.value === valorActual) ? valorActual : "";

    actualizarEtiquetaComboItem();
    if (comboItemAbierto) renderListaComboItem($("stats-item-buscar").value);
}

// Refleja en el botón visible el ítem que está guardado en el <select> oculto.
function actualizarEtiquetaComboItem() {
    const valor = $("stats-item").value;
    if (!valor) {
        $("stats-item-etiqueta").textContent = "Todos los ítems";
        return;
    }
    const info = itemsPorId[valor];
    $("stats-item-etiqueta").textContent = info
        ? `${info.nombre} (${info.tipo === "mods" ? "Mod" : "Textura"})`
        : "Ítem seleccionado";
}

// Dibuja las opciones del panel desplegable, filtradas por lo que se
// haya escrito en el buscador. Se vuelve a llamar en cada tecleo, así
// que la búsqueda se siente instantánea aunque haya miles de ítems.
function renderListaComboItem(textoBusqueda) {
    const lista = $("stats-item-lista");
    const texto = (textoBusqueda || "").trim().toLowerCase();
    const valorActual = $("stats-item").value;

    const filtradas = texto
        ? comboItemOpciones.filter((op) => op.nombre.toLowerCase().includes(texto))
        : comboItemOpciones;

    let html = `<li class="combo-opcion${valorActual === "" ? " activa" : ""}" data-id="" role="option">
        <i data-lucide="layers" class="combo-opcion-ico"></i>
        <span>Todos los ítems</span>
    </li>`;

    if (texto && filtradas.length === 0) {
        html += `<li class="combo-sin-resultados">${icono("search-x")} Sin coincidencias</li>`;
    } else {
        html += filtradas.map((op) => `
            <li class="combo-opcion${valorActual === op.id ? " activa" : ""}" data-id="${op.id}" role="option">
                <i data-lucide="${op.tipo === "mods" ? "puzzle" : "palette"}" class="combo-opcion-ico"></i>
                <span>${escapeHTML(op.nombre)}</span>
                <span class="combo-opcion-tipo">${op.tipo === "mods" ? "Mod" : "Textura"}</span>
            </li>`).join("");
    }

    lista.innerHTML = html;
    refrescarIconos();
    lista.querySelectorAll(".combo-opcion[data-id]").forEach((li) => {
        li.addEventListener("click", () => seleccionarItemCombo(li.dataset.id));
    });
}

function seleccionarItemCombo(id) {
    $("stats-item").value = id;
    actualizarEtiquetaComboItem();
    cerrarComboItem();
    cargarEstadisticas();
}

function abrirComboItem() {
    comboItemAbierto = true;
    $("stats-item-panel").classList.add("activo");
    $("stats-item-disparador").setAttribute("aria-expanded", "true");
    $("stats-item-buscar").value = "";
    renderListaComboItem("");
    setTimeout(() => $("stats-item-buscar").focus(), 0);
}

function cerrarComboItem() {
    comboItemAbierto = false;
    $("stats-item-panel").classList.remove("activo");
    $("stats-item-disparador").setAttribute("aria-expanded", "false");
}

function fechaDesdeRango(dias) {
    if (!dias || Number(dias) === 0) return null;
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - Number(dias));
    return fecha.toISOString();
}

// Aplica el texto de búsqueda sobre statsTablaFilas y repinta la tabla.
// No toca los filtros de tipo/ítem/rango ni vuelve a pedir datos: solo
// decide qué filas del cache ya cargado se muestran.
function pintarTablaEstadisticas() {
    const texto = statsTablaBusqueda.trim().toLowerCase();
    const filtradas = texto
        ? statsTablaFilas.filter((f) => f.nombre.toLowerCase().includes(texto))
        : statsTablaFilas;

    $("stats-tabla-contador").textContent = statsTablaFilas.length
        ? `${filtradas.length} de ${statsTablaFilas.length} ítems`
        : "";

    const sinResultadosPorBusqueda = texto !== "" && statsTablaFilas.length > 0 && filtradas.length === 0;
    $("stats-tabla-sin-resultados").style.display = sinResultadosPorBusqueda ? "block" : "none";
    if (sinResultadosPorBusqueda) {
        $("stats-tabla-sin-resultados-texto").textContent = statsTablaBusqueda.trim();
    }

    $("stats-tabla-body").innerHTML = sinResultadosPorBusqueda
        ? ""
        : filtradas.map((f) => `<tr>
            <td>${escapeHTML(f.nombre)}</td>
            <td>${f.tipo ? (f.tipo === "mods" ? "Mod" : "Textura") : "—"}</td>
            <td>${f.cantidad}</td>
        </tr>`).join("") || `<tr><td colspan="3" class="vacio">Sin datos</td></tr>`;
}

async function cargarEstadisticas() {
    const tipo = $("stats-tipo").value || null;
    const itemId = $("stats-item").value || null;
    const desde = fechaDesdeRango($("stats-rango").value);

    let filas = [];
    try {
        filas = await Datos.listarDescargas({ tipo, itemId, desde });
    } catch (e) {
        toast("Error cargando estadísticas: " + e.message, "error");
        return;
    }

    // --- Resumen (tarjetas) ---
    const totalDescargas = filas.length;
    const conteoPorItem = {};
    filas.forEach((f) => {
        conteoPorItem[f.item_id] = (conteoPorItem[f.item_id] || 0) + 1;
    });
    let itemTop = null;
    let itemTopCantidad = 0;
    Object.entries(conteoPorItem).forEach(([id, cant]) => {
        if (cant > itemTopCantidad) {
            itemTopCantidad = cant;
            itemTop = id;
        }
    });
    const nombreTop = itemTop && itemsPorId[itemTop] ? itemsPorId[itemTop].nombre : "—";

    $("stats-resumen").innerHTML = `
        <div class="stat-card"><div class="num">${totalDescargas}</div><div class="label">Descargas en el rango</div></div>
        <div class="stat-card"><div class="num">${itemTopCantidad}</div><div class="label">Más descargado: ${escapeHTML(nombreTop)}</div></div>
        <div class="stat-card"><div class="num">${Object.keys(conteoPorItem).length}</div><div class="label">Ítems distintos con descargas</div></div>
    `;

    // --- Tabla por ítem ---
    // Se guarda como datos (no como HTML ya armado) para poder filtrarla
    // en tiempo real desde el buscador sin volver a consultar Supabase.
    statsTablaFilas = Object.entries(conteoPorItem)
        .map(([id, cant]) => {
            const info = itemsPorId[id];
            return {
                id,
                nombre: info ? info.nombre : "(eliminado)",
                tipo: info ? info.tipo : null,
                cantidad: cant,
            };
        })
        .sort((a, b) => b.cantidad - a.cantidad);
    pintarTablaEstadisticas();

    // --- Gráfico: descargas por día ---
    const porDia = {};
    filas.forEach((f) => {
        const dia = f.creado_en.slice(0, 10); // YYYY-MM-DD
        porDia[dia] = (porDia[dia] || 0) + 1;
    });
    const dias = Object.keys(porDia).sort();

    const canvas = $("grafico-descargas");
    $("stats-vacio").style.display = dias.length === 0 ? "block" : "none";
    canvas.style.display = dias.length === 0 ? "none" : "block";

    if (graficoDescargas) {
        graficoDescargas.destroy();
        graficoDescargas = null;
    }

    if (dias.length > 0) {
        graficoDescargas = new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels: dias,
                datasets: [{
                    label: "Descargas",
                    data: dias.map((d) => porDia[d]),
                    backgroundColor: "#9801ac",
                    borderRadius: 4,
                }],
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
            },
        });
    }
}

// ---------- Generador IA (busca en CurseForge y agrega mods/texturas nuevos) ----------

let iaDetener = false;
let iaCorriendo = false;

function iaAgregarLog(icono_, texto, sub = "", tipoClase = "") {
    const li = document.createElement("li");
    li.className = tipoClase ? `ia-log-${tipoClase}` : "";
    li.innerHTML = `<span class="ia-log-ico">${icono(icono_)}</span><span class="ia-log-texto">${escapeHTML(texto)}${sub ? `<small>${escapeHTML(sub)}</small>` : ""}</span>`;
    $("ia-log").prepend(li);
    refrescarIconos();
}

function iaActualizarBarra(hechos, total) {
    const pct = total > 0 ? Math.round((hechos / total) * 100) : 0;
    $("ia-barra-relleno").style.width = pct + "%";
    $("ia-progreso-texto").textContent = `${hechos} de ${total} procesados…`;
}

async function iaObtenerToken() {
    const { data } = await supabaseClient.auth.getSession();
    return data?.session?.access_token || null;
}

$("form-ia-generar").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (iaCorriendo) return;

    const tipo = $("ia-tipo").value;
    const cantidad = Math.max(1, parseInt($("ia-cantidad").value, 10) || 1);

    const token = await iaObtenerToken();
    if (!token) {
        toast("Tu sesión expiró, vuelve a iniciar sesión.", "error");
        return;
    }

    iaDetener = false;
    iaCorriendo = true;
    $("ia-log").innerHTML = "";
    $("ia-progreso-wrap").style.display = "block";
    $("btn-ia-generar").disabled = true;
    $("btn-ia-generar").textContent = "Generando…";
    $("btn-ia-detener").style.display = "inline-flex";
    iaActualizarBarra(0, cantidad);

    let agregados = 0;
    let indice = 0;

    for (let i = 0; i < cantidad; i++) {
        if (iaDetener) {
            iaAgregarLog("octagon-x", "Detenido por el usuario.");
            break;
        }

        try {
            const resp = await fetch("/api/ia-generar", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ tipo, indiceInicio: indice }),
            });
            const body = await resp.json().catch(() => ({}));

            if (!resp.ok) {
                iaAgregarLog("alert-triangle", "Error buscando candidato.", body.error || `HTTP ${resp.status}`, "error");
                if (resp.status === 401 || resp.status === 403) break; // sin sesión / sin permiso: no sigue insistiendo
                if (typeof body.siguienteIndice === "number") indice = body.siguienteIndice;
                continue;
            }

            if (body.agotado) {
                iaAgregarLog("search-x", "No se encontraron más candidatos nuevos en CurseForge.");
                break;
            }

            indice = typeof body.siguienteIndice === "number" ? body.siguienteIndice : indice;
            agregados++;
            iaAgregarLog("sparkles", `"${body.item.nombre}" agregado`, "Pendiente de revisión", "ok");
        } catch (err) {
            iaAgregarLog("wifi-off", "Fallo de red, reintentando el siguiente…", err.message || "", "error");
        }

        iaActualizarBarra(i + 1, cantidad);
    }

    iaCorriendo = false;
    $("btn-ia-generar").disabled = false;
    $("btn-ia-generar").innerHTML = `${icono("wand-2")} Generar con IA`;
    $("btn-ia-detener").style.display = "none";
    refrescarIconos();
    toast(`Listo: ${agregados} elemento(s) nuevo(s) agregado(s) como pendiente.`);

    if (seccionActual === "ia") cargarPendientesIA();
    if (seccionActual === tipo) cargarSeccion();
});

$("btn-ia-detener").addEventListener("click", () => { iaDetener = true; });

async function cargarPendientesIA() {
    const cont = $("ia-pendientes-lista");
    cont.innerHTML = `<p class="vacio">Cargando…</p>`;
    $("ia-pendientes-vacio").style.display = "none";

    const [mods, texturas] = await Promise.all([Datos.listar("mods"), Datos.listar("texturas")]);
    const pendientes = [
        ...mods.filter((m) => m.estado === "pendiente").map((m) => ({ ...m, _tabla: "mods" })),
        ...texturas.filter((t) => t.estado === "pendiente").map((t) => ({ ...t, _tabla: "texturas" })),
    ];

    if (pendientes.length === 0) {
        cont.innerHTML = "";
        $("ia-pendientes-vacio").style.display = "block";
        return;
    }

    cont.innerHTML = pendientes.map((it) => {
        const img = sanitizeURL(it.imagen) || "imagenes/logo.png";
        return `<div class="ia-candidato" data-tabla="${it._tabla}" data-id="${it.id}">
            <img src="${img}" alt="" onerror="this.src='imagenes/logo.png'">
            <div class="info">
                <div class="n">${escapeHTML(it.nombre)} <span class="pill neutro">${it._tabla === "mods" ? "Mod" : "Textura"}</span>${it.version_minecraft ? `<span class="pill neutro">${escapeHTML(it.version_minecraft)}</span>` : ""}</div>
                <div class="d">${escapeHTML((it.descripcion || "").slice(0, 160))}${(it.descripcion || "").length > 160 ? "…" : ""}</div>
            </div>
            <div class="acciones">
                <button class="btn-icono ia-aprobar">${icono("check")} <span class="txt">Aprobar</span></button>
                <button class="btn-icono ia-editar">${icono("edit-3")} <span class="txt">Editar</span></button>
                <button class="btn-icono ia-rechazar">${icono("x")} <span class="txt">Rechazar</span></button>
            </div>
        </div>`;
    }).join("");

    refrescarIconos();

    cont.querySelectorAll(".ia-candidato").forEach((el) => {
        const tabla = el.dataset.tabla;
        const id = el.dataset.id;

        el.querySelector(".ia-aprobar").addEventListener("click", async () => {
            try {
                await Datos.actualizar(tabla, id, { estado: "publicado" });
                toast("Publicado. Ya aparece en el sitio.");
                cargarPendientesIA();
            } catch (err) {
                toast("No se pudo publicar: " + (err.message || "error desconocido"), "error");
            }
        });

        el.querySelector(".ia-rechazar").addEventListener("click", async () => {
            try {
                // No se borra: se marca "rechazado" para que el generador IA
                // lo siga reconociendo como "ya visto" y no lo vuelva a
                // sugerir. Queda oculto del sitio y de la lista normal.
                await Datos.actualizar(tabla, id, { estado: "rechazado" });
                toast("Rechazado. No se volverá a sugerir.");
                cargarPendientesIA();
            } catch (err) {
                toast("No se pudo rechazar: " + (err.message || "error desconocido"), "error");
            }
        });

        el.querySelector(".ia-editar").addEventListener("click", async () => {
            cambiarSeccion(tabla);
            await cargarSeccion();
            abrirForm(id);
        });
    });
}

document.addEventListener("DOMContentLoaded", iniciarPanel);
