/*
  seguridad.js
  -----------------------------------------------------------
  Utilidades compartidas para evitar XSS (Cross-Site Scripting).

  ¿Qué es el problema que arregla esto?
  Cuando el sitio arma HTML a mano con datos que vienen de
  "afuera" (una reseña escrita por un usuario, el nombre de
  una cuenta de Google, un texto de búsqueda, etc.) y lo mete
  con innerHTML, si esa persona escribe algo como:
      <img src=x onerror="robarDatos()">
  el navegador lo va a EJECUTAR como si fuera código del sitio.
  Eso es un XSS: te "cuelan" código en un input y la propia
  página lo corre.

  La regla de oro: todo texto que no haya escrito el
  desarrollador a mano en el HTML (o sea, todo lo que venga de
  una base de datos, un formulario, una URL, un login, etc.)
  se pasa por escapeHTML() antes de insertarse con innerHTML.
  Así, en vez de ejecutarse, se muestra como texto plano.

  Uso:
    <p>${escapeHTML(reseña.comentario)}</p>

  Para URLs (src, href) además usamos sanitizeURL(), que solo
  deja pasar direcciones http/https reales y descarta cosas
  como "javascript:alert(1)" que algunos ataques usan para
  ejecutar código a través de un link o una imagen.
  -----------------------------------------------------------
*/

function escapeHTML(valor) {
    if (valor === null || valor === undefined) return "";
    return String(valor)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function sanitizeURL(url, opciones = {}) {
    const { permitirRelativas = true } = opciones;
    if (!url) return "";
    try {
        const base = permitirRelativas ? window.location.href : undefined;
        const u = new URL(String(url).trim(), base);
        if (u.protocol === "http:" || u.protocol === "https:") {
            return u.href;
        }
    } catch (e) {
        // URL inválida o mal formada: se descarta.
    }
    return "";
}

/*
  conTimeout(promesa, ms)
  -----------------------------------------------------------
  Evita pantallas de carga (skeletons) que se quedan girando
  para siempre cuando una petición a la red (Supabase, APIs
  externas, etc.) nunca responde ni falla explícitamente -algo
  bastante común en conexiones móviles inestables-.

  Si "promesa" no se resuelve ni se rechaza dentro de "ms"
  milisegundos, esta función rechaza con un Error, para que el
  código que llama pueda mostrar un estado de error/fallback en
  vez de quedarse esperando indefinidamente.

  Uso:
    const datos = await conTimeout(Datos.listarPagina(...), 12000);
  -----------------------------------------------------------
*/
function conTimeout(promesa, ms = 12000, mensaje = "La solicitud tardó demasiado en responder") {
    let idTimeout;
    const timeoutPromesa = new Promise((_, reject) => {
        idTimeout = setTimeout(() => reject(new Error(mensaje)), ms);
    });
    return Promise.race([promesa, timeoutPromesa]).finally(() => clearTimeout(idTimeout));
}
