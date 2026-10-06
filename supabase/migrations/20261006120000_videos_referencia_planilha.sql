-- Banco de referências importado de planilha (Excel/CSV): além do título
-- (headline falada) e do link, guarda criador, data de publicação,
-- visualizações e transcrição de cada vídeo.
alter table public.videos_referencia add column if not exists criador text;
alter table public.videos_referencia add column if not exists data_publicacao date;
alter table public.videos_referencia add column if not exists visualizacoes bigint;
alter table public.videos_referencia add column if not exists transcricao text;

create index if not exists videos_referencia_cliente_link_idx
  on public.videos_referencia (cliente_id, link_video);
