/*
  theme.js
  -----------------------------------------------------------
  Modo oscuro/claro compartido. Requiere:
    - Un botón con id="theme-toggle" en la navbar de cada página
    - Reglas CSS ".dark-mode ..." definidas en cada página
      (ya agregadas en index.html, mods.html, servidores.html,
      texturas.html, servidor-detalle.html y 404.html)

  El icono del botón es un SVG inline (sol/luna) en vez de un
  emoji: así se ve igual en todos los sistemas operativos y
  navegadores, en vez de depender de la fuente de emojis de
  cada plataforma.
  -----------------------------------------------------------
*/

(function () {
    const KEY = "vivandro-theme";
    const saved = localStorage.getItem(KEY) || "light";

    const ICONO_LUNA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M20.742 13.045a8.088 8.088 0 0 1-2.077.273c-4.508 0-8.16-3.653-8.16-8.16 0-1.174.25-2.353.732-3.404a.75.75 0 0 0-.926-1.02A10.5 10.5 0 1 0 22.47 13.727a.75.75 0 0 0-.99-.847 8.06 8.06 0 0 1-.738.165z"/></svg>';
    const ICONO_SOL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 4.5a1 1 0 0 1-1-1v-2a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1zm0 19a1 1 0 0 1-1-1v-2a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1zM4.22 5.64a1 1 0 0 1-1.42 0l-1.4-1.42a1 1 0 1 1 1.4-1.42l1.42 1.42a1 1 0 0 1 0 1.42zm16.98 16.98a1 1 0 0 1-1.42 0l-1.4-1.42a1 1 0 1 1 1.4-1.42l1.42 1.42a1 1 0 0 1 0 1.42zM2.5 13h-2a1 1 0 1 1 0-2h2a1 1 0 1 1 0 2zm21 0h-2a1 1 0 1 1 0-2h2a1 1 0 1 1 0 2zM4.22 20.36a1 1 0 0 1 0-1.42l1.42-1.4a1 1 0 1 1 1.42 1.4l-1.42 1.42a1 1 0 0 1-1.42 0zM18.36 5.64a1 1 0 0 1 0-1.42l1.42-1.4a1 1 0 1 1 1.42 1.4l-1.42 1.42a1 1 0 0 1-1.42 0zM12 6.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z"/></svg>';

    function aplicarTema(tema) {
        document.documentElement.classList.toggle("dark-mode", tema === "dark");
    }

    // Aplicar antes de pintar para evitar parpadeo
    aplicarTema(saved);

    document.addEventListener("DOMContentLoaded", () => {
        const boton = document.getElementById("theme-toggle");
        if (!boton) return;

        boton.innerHTML = saved === "dark" ? ICONO_SOL : ICONO_LUNA;

        boton.addEventListener("click", () => {
            const esOscuro = document.documentElement.classList.toggle("dark-mode");
            localStorage.setItem(KEY, esOscuro ? "dark" : "light");
            boton.innerHTML = esOscuro ? ICONO_SOL : ICONO_LUNA;
        });
    });
})();
