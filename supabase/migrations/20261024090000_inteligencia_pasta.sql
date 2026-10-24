-- Pasta ao vivo como conhecimento do funcionário (24/10, Davi: "conectar a pasta" → "deixa conectada de verdade").
-- Em vez de copiar o texto, o item guarda só a pasta: quem lê (scripts/inteligencia/ler.py) junta na hora o texto
-- atual de todos os documentos dela e das subpastas. Documento novo na pasta entra sozinho.
alter table public.inteligencia_membros add column if not exists pasta_id uuid references public.pastas_atividade(id) on delete cascade;

alter table public.inteligencia_membros drop constraint if exists inteligencia_membros_tipo_check;
alter table public.inteligencia_membros add constraint inteligencia_membros_tipo_check
  check (tipo = any (array['pdf', 'texto', 'video', 'link', 'aprendizado', 'pasta']));

alter table public.inteligencia_membros drop constraint if exists inteligencia_membros_pasta_tem_pasta;
alter table public.inteligencia_membros add constraint inteligencia_membros_pasta_tem_pasta
  check ((tipo = 'pasta') = (pasta_id is not null));

-- O app grava este cadastro por colunas liberadas uma a uma: a nova entra na lista.
grant select (pasta_id), insert (pasta_id) on public.inteligencia_membros to authenticated;
