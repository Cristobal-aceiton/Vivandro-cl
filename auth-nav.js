/*
  auth-nav.js
  -----------------------------------------------------------
  Botón de "Iniciar sesión con Google" / usuario logueado +
  "Cerrar sesión", para la navbar de todo el sitio.

  Usa el mismo supabaseClient definido en supabase-client.js
  (mismo login que ya usan las reseñas), así que si el usuario
  inicia sesión desde la navbar, también queda logueado para
  dejar su reseña, y viceversa.

  Requiere en cada página, en este orden:
    <script src="https://unpkg.com/@supabase/supabase-js@2.112.3"></script>
    <script src="supabase-client.js"></script>
    <script src="auth-nav.js"></script>

  Y en la navbar, dentro de .navbar-right:
    <div class="nav-auth" id="nav-auth"></div>
  -----------------------------------------------------------
*/

(function () {
    function iconoGoogle() {
        return `<svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.6 0-14.1 4.3-17.4 10.6z"/><path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5C29.6 34.8 26.9 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.6 5.1C9.8 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.5 5.5C40.8 36.4 44 30.8 44 24c0-1.3-.1-2.7-.4-3.5z"/></svg>`;
    }

    function clienteListo() {
        return typeof supabaseClient !== "undefined" && supabaseClient !== null;
    }

    function pintar(sesion) {
        const cont = document.getElementById("nav-auth");
        if (!cont) return;

        if (!clienteListo()) {
            // Supabase aún no está conectado (ver supabase-client.js)
            cont.innerHTML = "";
            return;
        }

        if (!sesion) {
            cont.innerHTML = `
                <button id="nav-btn-login" class="nav-btn-google" type="button">
                    ${iconoGoogle()}<span>Iniciar sesión</span>
                </button>
            `;
            document.getElementById("nav-btn-login").addEventListener("click", async () => {
                await supabaseClient.auth.signInWithOAuth({
                    provider: "google",
                    options: { redirectTo: window.location.href }
                });
            });
            return;
        }

        const usuario = sesion.user;
        // Estos datos vienen de la cuenta de Google del usuario: nunca se
        // insertan tal cual en el HTML, siempre pasan por escapeHTML/sanitizeURL.
        const nombre = escapeHTML(usuario.user_metadata?.full_name || usuario.email);
        const foto = sanitizeURL(usuario.user_metadata?.avatar_url);

        cont.innerHTML = `
            <div class="nav-usuario">
                ${foto ? `<img src="${foto}" alt="${nombre}">` : ""}
                <span class="nav-usuario-nombre">${nombre}</span>
                <button id="nav-btn-logout" class="nav-btn-logout" type="button" title="Cerrar sesión">Cerrar sesión</button>
            </div>
        `;
        document.getElementById("nav-btn-logout").addEventListener("click", async () => {
            await supabaseClient.auth.signOut();
        });
    }

    async function iniciarAuthNav() {
        if (!clienteListo()) {
            pintar(null);
            return;
        }

        const { data } = await supabaseClient.auth.getSession();
        pintar(data.session);

        supabaseClient.auth.onAuthStateChange((_evento, sesion) => {
            pintar(sesion);
        });
    }

    document.addEventListener("DOMContentLoaded", iniciarAuthNav);
})();
