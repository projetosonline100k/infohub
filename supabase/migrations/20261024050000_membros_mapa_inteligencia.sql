-- Mapa da inteligência de cada funcionário (24/10, Davi: "quero a inteligência de cada carinha: cadastrar as
-- informações e visualizar em mapa mental"). Centro (título/subtítulo) e pilares numerados, cada um com
-- descrição, itens e exemplo; vai junto no pedido para a IA (escritaAgentes.mapaParaTexto).
alter table public.membros add column if not exists mapa_inteligencia jsonb;

alter table public.membros drop constraint if exists membros_mapa_inteligencia_formato;
alter table public.membros add constraint membros_mapa_inteligencia_formato
  check (mapa_inteligencia is null or (jsonb_typeof(mapa_inteligencia) = 'object' and coalesce(jsonb_typeof(mapa_inteligencia -> 'pilares'), '') = 'array'));
