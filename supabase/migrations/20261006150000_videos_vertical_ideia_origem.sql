-- Vídeo do pipeline criado a partir de uma ideia ("Mover para roteiro"):
-- a ideia continua na lista de ideias (marcada como usada) e o vídeo novo
-- aponta pra ela.
alter table public.videos_vertical
  add column if not exists ideia_origem_id uuid references public.videos_vertical(id) on delete set null;

create index if not exists videos_vertical_ideia_origem_idx
  on public.videos_vertical (ideia_origem_id) where ideia_origem_id is not null;
