# SEO — Vivandro

Dominio actual: **https://vivandro-cl-i1x2.vercel.app** (subdominio
gratuito de Vercel — `vivandro.cl` todavía no existe/no está comprado).

## ⚠️ Importante mientras no tengas dominio propio

Con el sitio viviendo en un subdominio `.vercel.app`, dejé
`robots.txt` bloqueando **todo** el rastreo a propósito
(`Disallow: /`). Es a propósito, no un error: si Google indexa esta
URL provisoria y después conectas `vivandro.cl` (o el dominio que
compres), vas a tener que migrar esa indexación con redirects 301 en
vez de partir limpio. Mejor esperar a tener el dominio definitivo.

**Cuando conectes tu dominio en Vercel:**
1. Reemplaza el contenido de `robots.txt` por el de
   `robots-produccion.txt` (o simplemente renombra este último a
   `robots.txt`).
2. Corre este comando para actualizar todas las URLs (canonical, Open
   Graph, JSON-LD, sitemap) al dominio nuevo — reemplaza
   `tudominio.cl` por el real:
   ```
   grep -rl "vivandro-cl-i1x2.vercel.app" . | xargs sed -i 's#https://vivandro-cl-i1x2.vercel.app#https://tudominio.cl#g'
   ```
3. Da de alta el dominio (no el `.vercel.app`) en Google Search
   Console y envía `sitemap.xml`.

## Aplicado

**Todas las páginas públicas** (index, servidores, servidor-detalle, mods,
texturas, política de privacidad, términos):
- `title` y `meta description` únicos por página.
- `link rel="canonical"` con URLs limpias (sin `.html`).
- Open Graph (`og:*`) y Twitter Cards.
- `meta name="robots" content="index, follow"` explícito.

**URLs limpias**: `vercel.json` tiene `"cleanUrls": true`, así que
Vercel sirve `/servidores.html` en `/servidores` y redirige (308) la
versión con `.html` a la limpia automáticamente. Todos los canonical,
OG, JSON-LD y el sitemap ya usan las rutas sin extensión.

**Jerarquía de encabezados**: se corrigieron saltos de h1 a h3 sin h2 en
las tarjetas de servidores/mods/texturas (ahora usan `<h2>`).

**Datos estructurados (JSON-LD)**:
- Inicio: `WebSite` + `Organization`.
- Servidores/Mods/Texturas: `BreadcrumbList` estático + `ItemList`
  dinámico (se regenera en JS cada vez que cambia la página o el
  filtro, porque el contenido sale de Supabase).
- Detalle de servidor: `title`, meta description, canonical, Open
  Graph, Twitter Card y `BreadcrumbList` se sincronizan por JS con los
  datos reales del servidor apenas se cargan (la página es 100%
  dinámica, no hay HTML estático por servidor).

**Panel admin — no debe aparecer en buscadores**:
- `meta name="robots" content="noindex, nofollow, noarchive,
  nosnippet"` en `admin-panel.html`.
- `vercel.json` agrega además el header HTTP `X-Robots-Tag` con el
  mismo valor sobre `/admin-panel` y `/admin-panel.html` (funciona
  aunque alguien vea el HTML sin ejecutar JS).
- `robots-produccion.txt` bloquea el rastreo de
  `admin-panel(.html/.js/.css)`, los `.sql` y el README interno.
- La protección real de los datos sigue siendo Row Level Security en
  Supabase (Postgres), no el `robots.txt` ni el `noindex` — eso solo
  evita que aparezca en buscadores, no reemplaza la autenticación.

**sitemap.xml**: es un *índice* de sitemaps:
- `sitemap-paginas.xml`: las 6 páginas públicas fijas.
- `sitemap-servidores.xml`: **no se genera automáticamente** porque
  las fichas de servidor viven en Supabase, a la que no tengo acceso
  desde acá. Usa `generar-sitemap-servidores.js` (incluido):
  `npm install @supabase/supabase-js` y correrlo con `SUPABASE_URL` y
  `SUPABASE_ANON_KEY` como variables de entorno. Ideal automatizarlo
  (cron, GitHub Action, o al guardar un servidor desde el panel).

**Imágenes / rendimiento**:
- `imagenes/logo.png`: 2000×2000 (45 KB) → 512×512 (16 KB).
- `imagenes/curseforge.png`: 320×320 (16 KB) → 64×64 (4 KB), con
  `width`/`height` explícitos para evitar layout shift (CLS).
- Se eliminaron `imagenes/5.png` y `imagenes/fondo1.webp` (no estaban
  referenciadas en ningún lado).
- Preconnect a `api.mcstatus.io` en `servidores.html`.
- Cache-Control agresivo para `/imagenes/*` y `*.css/*.js` vía
  `vercel.json`.

## Pendiente / depende de ti

1. **Dominio propio** — sin esto, no tiene sentido dar de alta el
   sitio en Search Console todavía (ver nota de arriba).
2. **Email del admin en `admin-panel.js`** (`ADMIN_EMAIL =
   "cristobalaceiton4@gmail.com"`): queda visible en texto plano en un
   JS público. El propio archivo explica que no es un problema de
   seguridad real porque la protección de verdad la hace Row Level
   Security en Supabase — el check en JS es solo para mostrar/ocultar
   la interfaz. No lo toqué porque cambia el flujo de autenticación y
   preferí no arriesgar que se rompa sin que me lo pidas
   explícitamente.
3. **Imagen social (og:image) dedicada**: todas las páginas usan
   `logo.png` para compartir en redes. Para verse mejor en
   WhatsApp/Twitter/Discord, lo ideal es una imagen 1200×630 por
   sección. No las generé porque no tengo el material gráfico de la
   marca.
