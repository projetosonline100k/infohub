-- Título de cada conversa do chat do ⌘I (24/10, Davi: "quero tornar ele um chat inteligente mesmo, ver as
-- outras conversas como no modo normal"): a IA dá um título curto depois da primeira resposta e a lista de
-- conversas mostra o título em vez da primeira pergunta. Fica repetido em todas as trocas da conversa.
alter table public.conversas_documento add column if not exists titulo text;

create index if not exists conversas_documento_por_conversa on public.conversas_documento (user_id, conversa, created_at);
