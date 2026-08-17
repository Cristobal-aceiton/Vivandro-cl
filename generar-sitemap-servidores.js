/*
  generar-sitemap-servidores.js
  -----------------------------------------------------------
  servidor-detalle.html?id=X es una página por cada servidor, pero esos
  datos viven en Supabase, no en el HTML — así que no se pueden listar
  en sitemap.xml a mano (se desactualizarían apenas agregues o borres un
  servidor). Este script lee la tabla "servidores" y genera
  sitemap-servidores.xml con una URL por cada uno.

  Cómo usarlo:
    1. npm install @supabase/supabase-js
    2. node generar-sitemap-servidores.js
       (necesita las variables de entorno SUPABASE_URL y
       SUPABASE_ANON_KEY, las mismas que usa supabase-client.js)
    3. Sube el sitemap-servidores.xml resultante junto al resto del
       sitio, a la misma altura que sitemap.xml y robots.txt.

  Ideal: automatizar este paso (GitHub Action programada, cron del
  hosting, o un trigger cuando se crea/edita un servidor desde el panel
  admin) para que el sitemap nunca quede desactualizado.
  -----------------------------------------------------------
*/

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SITE_URL = "https://vivandro-cl-i1x2.vercel.app";

async function main() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error("Faltan SUPABASE_URL y/o SUPABASE_ANON_KEY como variables de entorno.");
        process.exit(1);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: servidores, error } = await supabase
        .from("servidores")
        .select("id");

    if (error) {
        console.error("Error consultando Supabase:", error.message);
        process.exit(1);
    }

    const urls = servidores
        .map((s) => `    <url>
        <loc>${SITE_URL}/servidor-detalle?id=${encodeURIComponent(s.id)}</loc>
        <changefreq>weekly</changefreq>
        <priority>0.6</priority>
    </url>`)
        .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

    fs.writeFileSync("sitemap-servidores.xml", xml);
    console.log(`sitemap-servidores.xml generado con ${servidores.length} servidor(es).`);
}

main();
