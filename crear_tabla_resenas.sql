-- Si ya habias creado la tabla "resenas" antes (version sin login),
-- borrala primero para evitar conflictos:
drop table if exists resenas;

create table resenas (
  id uuid primary key default gen_random_uuid(),
  servidor_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  autor text not null,
  estrellas int not null check (estrellas between 1 and 5),
  comentario text check (char_length(comentario) <= 300),
  creado_en timestamp with time zone default now(),

  -- Un usuario solo puede dejar una reseña por servidor
  unique (servidor_id, user_id)
);

alter table resenas enable row level security;

-- Cualquiera puede leer las reseñas (aunque no haya iniciado sesión)
create policy "Cualquiera puede leer resenas"
  on resenas for select
  using (true);

-- Solo un usuario logueado puede crear SU PROPIA reseña
create policy "Usuarios logueados crean su propia resena"
  on resenas for insert
  to authenticated
  with check (auth.uid() = user_id);

-- (Opcional) permitir que el usuario borre su propia reseña
create policy "Usuarios borran su propia resena"
  on resenas for delete
  to authenticated
  using (auth.uid() = user_id);
