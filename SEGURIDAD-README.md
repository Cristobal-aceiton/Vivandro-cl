# Cabeceras de seguridad — Vivandro

`vercel.json` agrega estas cabeceras a todas las rutas (`/(.*)`):

- `X-Content-Type-Options: nosniff` y `Referrer-Policy` (ya estaban).
- `Strict-Transport-Security` (HSTS): fuerza HTTPS por 1 año, incluyendo
  subdominios. Sin `preload` a propósito — eso es un compromiso más
  difícil de revertir y no hace falta para un sitio nuevo.
- `Permissions-Policy`: desactiva cámara, micrófono, geolocalización y
  el tracking de "interest cohort" (Topics API), que el sitio no usa.
- `Content-Security-Policy` (CSP): ver detalle abajo.

## Por qué la CSP usa `'unsafe-inline'`

El sitio es HTML estático sin build step: todas las páginas públicas
tienen su CSS en un `<style>` dentro del propio HTML y su lógica en
`<script>` sueltos (sin nonces ni hashes). Una CSP estricta sin
`'unsafe-inline'` en `script-src`/`style-src` rompería literalmente
todas las páginas. Agregar nonces/hashes es un cambio de arquitectura
(requeriría generar cada página en el servidor o en build time), así
que no se hizo acá siguiendo la regla de "no cambiar arquitectura sin
necesidad". Si en el futuro se migra a un framework con build (Astro,
Next, etc.), ahí sí conviene endurecer esto con nonces.

## Dominios permitidos y por qué

- `script-src ... https://unpkg.com`: es de donde se carga
  `@supabase/supabase-js` (ver nota de versión fija en
  `supabase-client.js` / las páginas).
- `style-src ... https://fonts.googleapis.com` y
  `font-src ... https://fonts.gstatic.com`: Google Fonts (Poppins,
  Pixelify Sans).
- `img-src 'self' https: data:`: **a propósito muy permisivo**. Los
  logos de servidores, mods y texturas son URLs externas que el
  admin escribe a mano en el panel (CurseForge, wikis, imágenes
  propias, etc.), y la foto de perfil del login viene del dominio de
  Google que corresponda. No hay una lista fija de dominios posible
  sin romper esa función; restringirlo dejaría rotos los logos que ya
  están cargados en Supabase.
- `connect-src 'self' https://hridipfqnqcilnhopszo.supabase.co
  https://api.mcstatus.io`: la API de Supabase (login, lectura/
  escritura de datos) y la API que consulta el estado en vivo de los
  servidores en `servidores.html`.

**Si cambian de proyecto de Supabase** (nueva `SUPABASE_URL`), hay que
actualizar también esa URL en `connect-src` dentro de `vercel.json`,
o el login y las consultas dejarán de funcionar (la CSP las bloquearía
en el navegador, aunque el resto del sitio siga cargando).
