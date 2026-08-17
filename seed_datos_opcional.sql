-- =============================================================
--  seed_datos_opcional.sql
--  -----------------------------------------------------------
--  OPCIONAL. Corre esto después de db_schema_admin.sql si
--  quieres partir con los mismos servidores y mods que ya
--  tenía el sitio estático, en vez de partir con las tablas
--  vacías y cargar todo a mano desde el panel.
-- =============================================================

insert into servidores (nombre, logo, descripcion, jugadores_promedio, anio_creacion, ip, modalidades, orden) values
('UniversoCraft', 'https://static.wikia.nocookie.net/logopedia/images/3/3c/Universocraft2022.png/revision/latest?cb=20241119232915', 'La red de Minecraft hispanohablante más grande que existe. Fundada en 2013, hoy soporta hasta 20.000 jugadores simultáneos y en las horas punta suele superar los 3.000-4.000 conectados a la vez.', '3,000-4,000', 2013, 'mc.universocraft.com', array['SkyWars','BedWars','Survival','PvP'], 1),
('Librecraft', 'https://imgs.search.brave.com/hsST-zC-MIAl_7TU65T5QB7hPue0pfzpYgUWVvM2OnA/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly90b3Bn/Lm9yZy9nYWxsZXJ5/LzQzMTAyNC84MjI4/OC5wbmc', 'Se autodefine como la mayor network no premium en español, y con más de 10 años activa (desde 2015) y 51.000+ miembros en Discord, es de las más reconocidas de la escena hispana.', '100-250', 2015, 'mc.librecraft.com', array['BedWars','EggWars','SkyWars','Creative'], 2),
('ExtremeCraft', 'https://imgs.search.brave.com/3nMPaKf9LySQs_Z7M2Y_2xhTM0FPxQuTwmR446x0yKg/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9wcmV2/aWV3LnJlZGQuaXQv/ZXh0cmVtZWNyYWZ0/LXYwLWw4eWhiOHNp/dDJ0YzEucG5nP3dp/ZHRoPTgwMCZmb3Jt/YXQ9cG5nJmF1dG89/d2VicCZzPTU3Mzkx/MDgyYmNkNzIxYjM4/ZDJlMTVlYzE4MWEw/NzlhMzJlNjMwMDM', 'Servidor internacional (en inglés) activo desde 2015, alojado en Estados Unidos. Mantiene una comunidad grande y estable, normalmente entre 350 y 550 jugadores conectados a la vez.', '350-550', 2015, 'play.extremecraft.net', array['SkyBlock','Survival','Creative','PvP'], 3),
('MineLatino', 'https://minelatino.com/wp-content/uploads/2026/08/LOGO-ANIVERSARIO-2.png', 'Nació en julio de 2019 como un proyecto entre amigos y hoy es una de las networks para latinos más activas, con actualizaciones constantes y una comunidad fiel.', '300+', 2019, 'play.minelatino.com', array['SkyBlock','Survival OP','BedWars','PvP'], 4),
('Supercraft', 'https://imgs.search.brave.com/EvIViMJuEdSKj6urLNzyU8IXo90x2kuSTh9Zj6CN2To/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly90b3Bn/Lm9yZy9nYWxsZXJ5/LzI2MDcyMS81MTAy/NC5wbmc', 'El más nuevo de la lista: activo desde 2020, compatible con Java y Bedrock. Una comunidad más chica pero constante, con 150-250 jugadores conectados en horas altas.', '150-250', 2020, 'mc.supercraft.es', array['Factions','SkyWars','BuildBattle','Survival'], 5);

insert into mods (nombre, descripcion, imagen, curseforge_url, version_minecraft, orden) values
('Simple Voice Chat', 'Simple Voice Chat es un mod de Minecraft que añade chat de voz por proximidad al juego. Permite hablar con otros jugadores usando el micrófono sin necesidad de estar en Discord.', 'https://media.forgecdn.net/attachments/description/416089/description_e7b80129-1beb-4e61-ac59-53b45831481c.png', 'https://www.curseforge.com/minecraft/mc-mods/simple-voice-chat', '1.21.4', 1),
('Decocraft', 'DecoCraft es un mod de Minecraft que añade cientos de objetos decorativos para darle más detalle y personalidad a tus construcciones.', 'https://cdn.modrinth.com/data/IZJSgKZe/images/719a81fbe9d8760f26e3bde020f64029f1623f39.png', 'https://www.curseforge.com/minecraft/mc-mods/decocraft', '1.20.1', 2),
('Carry On', 'Carry On es un mod de Minecraft que permite recoger y transportar ciertos bloques y entidades con las manos, haciendo mucho más fácil mover objetos por el mundo.', 'https://media.forgecdn.net/attachments/215/207/2017-08-12_12.png', 'https://www.curseforge.com/minecraft/mc-mods/carry-on', '1.21.1', 3),
('Just Enough Items (JEI)', 'Just Enough Items (JEI) es un mod de Minecraft que permite ver todos los objetos y recetas disponibles directamente desde el inventario.', 'https://media.forgecdn.net/attachments/31/417/thzzdin.png', 'https://www.curseforge.com/minecraft/mc-mods/jei', '1.18.2', 4),
('Xaero''s Minimap', 'Xaero''s Minimap es un mod de Minecraft que añade un minimapa en la pantalla, permitiéndote orientarte y explorar el mundo con mayor facilidad.', 'https://chocolateminecraft.com/images/minimap_2020.png', 'https://www.curseforge.com/minecraft/mc-mods/xaeros-minimap', '1.21.8', 5);

-- No se incluyen texturas de ejemplo: agrégalas desde el panel de admin
-- (Texturas > + Agregar) una vez que el sitio esté conectado a Supabase.
