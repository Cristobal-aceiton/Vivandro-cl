# Panel de administración de Vivandro — cómo activarlo

## Qué se agregó / cambió

- `db_schema_admin.sql` — crea las tablas `servidores`, `mods`, `texturas` en Supabase y las protege con **Row Level Security**: cualquiera puede leer, pero **solo** un email que esté en la tabla `admins` puede crear, editar o eliminar. Esa comprobación la hace Postgres con el JWT firmado por Supabase Auth — no depende de nada que corra en el navegador, así que no se puede saltar editando el JavaScript ni llamando a la API a mano.
- `agregar_tabla_admins.sql` — crea la tabla `admins` (con un email marcado como `es_superadmin`) y actualiza TODAS las políticas RLS (servidores, mods, texturas, descargas, admin_log, intentos_acceso) para que revisen esa tabla en vez de un email fijo. Desde el panel, sección "Administradores", un superadmin puede autorizar o quitar administradores sin volver a tocar SQL.
- `seed_datos_opcional.sql` — (opcional) carga los servidores y mods que ya tenía el sitio, para no partir de cero.
- `datos.js` — capa única para leer/crear/editar/eliminar en esas 3 tablas, usada tanto por el sitio público como por el panel.
- `admin-panel.html` / `admin-panel.css` / `admin-panel.js` — el nuevo panel: sidebar con Servidores / Mods / Texturas / Configuración, tablas con buscador, modal de crear/editar, confirmación antes de eliminar, notificaciones (toasts) y estados de carga/error.
- `mods.html` y `texturas.html` — ya no tienen mods/texturas escritos a mano en el HTML. Se cargan desde Supabase y cada tarjeta muestra **un solo botón naranja "Descargar en CurseForge"** que abre el link que cargó el administrador (se acabaron los botones por versión). Cada click también registra una fila en la tabla `descargas` (sin datos personales, solo qué se descargó y cuándo).
- `crear_tabla_descargas.sql` — tabla de descargas: cualquiera puede insertar (registrar un click), pero **solo el admin puede leer** esos datos.
- `agregar_requisitos_mods.sql` — agrega a la tabla `mods` una columna `requisitos` (JSONB, hasta 4 objetos `{nombre, url}`). Desde el panel admin, al crear o editar un mod, se pueden cargar hasta 4 "requisitos" (mods/complementos que hace falta instalar antes, como una librería). Se muestran en `mods.html` como links celestes bajo el mod, separados del botón naranja de "Descargar en CurseForge". Es opcional: se puede dejar 0, 1, 2, 3 o 4.
- `agregar_validacion_duplicados_mods_texturas.sql` — evita crear (o renombrar) un mod o una textura con el mismo nombre que otro ya existente, sin importar mayúsculas/minúsculas (`OptiFine` = `optifine` = `OPTIFINE`). El panel admin avisa al instante mientras se escribe, pero la regla real vive en la base de datos: un índice único case-insensitive más un trigger que devuelve el mensaje "Este mod ya existe en la base de datos." / "Esta textura ya existe en la base de datos.". Al editar un mod/textura y dejarlo con su mismo nombre no se marca como duplicado.
- **Sección "📊 Estadísticas"** en el panel admin — gráfico de barras real (Chart.js) de descargas por día, filtrable por Mods/Texturas/Todos, por ítem específico, y por rango (7/30/90 días o todo el tiempo), más una tabla con el total por ítem.
- `servidores.html` y `servidor-detalle.html` — ahora leen los servidores desde Supabase en vez del archivo fijo `servers-data.js`.

## Pasos para dejarlo funcionando

1. **Crear el proyecto en Supabase** (si no lo tienes ya — `supabase-client.js` ya trae una URL/clave de ejemplo, reemplázalas por las tuyas en *Settings → API*).
2. **Correr el SQL**: Supabase → SQL Editor → pega el contenido de `db_schema_admin.sql` → Run. Luego corre también `crear_tabla_descargas.sql` (para las estadísticas), `mejoras_seguridad_backend.sql` (bitácora e intentos de acceso), `agregar_requisitos_mods.sql` (para los requisitos de mods) y `agregar_validacion_duplicados_mods_texturas.sql` (para bloquear mods/texturas duplicados). Después corre **`agregar_tabla_admins.sql`** (crea la tabla de administradores y deja todo lo anterior apuntando a ella — revisa el bloque "Semilla" de ese archivo antes de correrlo). Opcionalmente corre después `seed_datos_opcional.sql`.
3. **Activar Google como proveedor de login**: Authentication → Providers → Google (te pide un OAuth Client ID de Google Cloud Console, gratis). En "Redirect URLs" agrega tu dominio (ej. `https://vivandro.cl`) y `http://localhost` si vas a probar en local.
4. **Iniciar sesión** en el sitio con un email que hayas dejado en la tabla `admins` (por defecto, el que estaba hardcodeado antes) y entrar a `admin-panel.html`. Con cualquier otra cuenta, el panel muestra "No tienes acceso" y no deja pasar (y aunque alguien fuerce la interfaz, el paso 2 ya bloqueó la escritura en la base de datos). Desde la sección "Administradores" del panel, ese primer superadmin puede autorizar a otras cuentas.

## Administradores (multi-admin)

- Cualquier email en la tabla `admins` puede entrar al panel y administrar servidores, mods y texturas — igual que antes con el único admin.
- Solo un admin con `es_superadmin = true` puede agregar o quitar administradores desde la sección "Administradores". Un admin normal ve la lista pero no tiene botones para tocarla (y aunque los forzara con el inspector, el servidor lo rechaza igual vía RLS).
- Para convertir a alguien en superadmin (o quitarle ese rol) hay que hacerlo a mano por ahora: `update admins set es_superadmin = true where email = 'correo@ejemplo.com';` en el SQL Editor.

## Notas de seguridad, en corto

- El email autorizado ya no está hardcodeado: vive en la tabla `admins`, protegida por sus propias políticas RLS (solo un superadmin puede agregar/quitar filas). Eso es lo que realmente protege el panel, no el frontend.
- Todo texto que entra por los formularios pasa por `escapeHTML()` antes de mostrarse (evita XSS), y todos los links/imagenes pasan por `sanitizeURL()` (solo deja pasar `http`/`https`, descarta cosas como `javascript:`).
- No hay contraseñas propias que administrar: el login es 100% Google OAuth vía Supabase Auth.
- Las claves que aparecen en `supabase-client.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) son públicas por diseño en apps basadas en Supabase — la seguridad real no depende de ocultarlas, sino de las políticas RLS.
