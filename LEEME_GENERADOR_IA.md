# Generador IA — cómo activarlo

Esta función busca en CurseForge mods o packs de texturas reales que
todavía no están en tu sitio, arma el nombre/imagen/link/versión/
requisitos con datos 100% reales (nunca inventados), le pide a la IA
que redacte la descripción en español a partir de esos datos, y los
deja **pendientes de revisión** en el panel admin (sección
"Generador IA") hasta que tú los apruebas.

Necesitas 3 cosas antes de que funcione: una API key de CurseForge,
la Service Role Key de Supabase, y (opcional pero recomendado) una
API key de Groq — **100% gratis**. Ninguna de las tres va en el
código: se configuran como variables de entorno en Vercel.

## 1) Corre la migración SQL

Abre Supabase → SQL Editor → pega y ejecuta
`agregar_ia_generador_mods_texturas.sql` (una sola vez).

## 2) Pide tu API key de CurseForge

**Importante:** a diferencia de otras APIs, esta no es autoservicio
instantáneo. CurseForge revisa cada solicitud a mano.

1. Entra a console.curseforge.com y crea una cuenta (gratis).
2. Completa este formulario de solicitud de key para "3rd party API":
   https://forms.monday.com/forms/dce5ccb7afda9a1c21dab1a1aa1d84eb?r=use1
   Vas a tener que describir brevemente tu proyecto (por ejemplo:
   "sitio web en español que muestra mods y texture packs de
   Minecraft, con link directo a la página de descarga en
   CurseForge").
3. El equipo de Overwolf/CurseForge revisa y aprueba por correo
   (no es instantáneo, puede tardar algunos días).
4. Una vez aprobado, generas la key desde console.curseforge.com y la
   copias.

Mientras esperas la aprobación, todo lo demás (el resto del panel,
las otras dos animaciones, el modo oscuro) ya funciona sin depender
de esto.

## 3) Consigue la Service Role Key de Supabase

Supabase → tu proyecto → Settings → API → sección "Project API keys"
→ copia la que dice **service_role** (no la "anon" que ya usa
`supabase-client.js`).

⚠️ Esta clave puede saltarse todas las reglas de seguridad (RLS).
Nunca la pongas en `supabase-client.js` ni en ningún archivo que se
suba al navegador — solo va como variable de entorno del servidor.
Por eso la función que la usa vive en `/api/ia-generar.js`, que
corre en Vercel, no en el navegador.

## 4) (Opcional) Consigue una API key de Groq — es gratis

Para que la descripción quede redactada en español de forma más
atractiva en vez de solo el resumen en inglés de CurseForge:

1. Ve a https://console.groq.com y crea una cuenta (gratis, con
   Google o email).
2. Entra a "API Keys" y genera una key nueva.
3. Groq tiene una capa gratuita con un límite diario de peticiones.
   Como esta función solo se usa cuando tú generas mods/texturas a
   mano desde el panel (no es tráfico de visitantes del sitio), el
   límite gratuito alcanza sobrado para este uso.

Si no configuras esta variable, el generador sigue funcionando
igual, solo que guarda el resumen tal como viene de CurseForge (en
inglés).

## 5) Configura las variables en Vercel

Vercel → tu proyecto → Settings → Environment Variables → agrega:

| Nombre | Valor |
|---|---|
| `CURSEFORGE_API_KEY` | la del paso 2 |
| `SUPABASE_URL` | la misma URL que ya está en `supabase-client.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | la del paso 3 |
| `GROQ_API_KEY` | la del paso 4 (opcional, gratis) |

Después de agregarlas, vuelve a desplegar el proyecto (un simple
redeploy alcanza, no hace falta tocar código) para que la función
las lea.

## Solución de problemas

**Error "null value in column admin_email of relation admin_log":**
corre `arreglo_admin_log_generador_ia.sql` una sola vez en Supabase →
SQL Editor. Arregla el trigger de auditoría para que no falle cuando
el Generador IA inserta usando la Service Role Key (sin sesión de
usuario).

## 6) Usarlo

Panel admin → "Generador IA" → elige Mods o Texturas, cuántos
quieres, y "Generar con IA". Puedes cerrar la pestaña y volver
después: lo que ya se agregó queda guardado; solo el progreso de esa
tanda se pierde si recargas a mitad de camino, pero puedes volver a
apretar "Generar" y sigue agregando cosas nuevas (no repite lo que
ya existe).

Todo queda como **pendiente** hasta que lo apruebes en la sección
"Pendientes de revisión" (o desde la lista normal de Mods/Texturas,
donde vas a ver una etiqueta amarilla "Pendiente" y un botón
"Publicar").
