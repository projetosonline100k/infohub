-- Tradução das referências em outra língua (Ideias em destaque): o app
-- detecta o idioma, traduz headline e transcrição pro português e guarda
-- aqui pra não traduzir de novo. idioma = 'pt' marca "já conferido, é
-- português". As policies de videos_referencia já cobrem as colunas novas.
alter table public.videos_referencia
  add column if not exists idioma text,
  add column if not exists titulo_pt text,
  add column if not exists transcricao_pt text;
