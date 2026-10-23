-- Conversas do chat do ⌘I nos documentos (24/10, Davi: "quero que fiquem salvos, a ideia é virar um
-- super cérebro"). Uma linha por troca (pedido → resposta); `conversa` agrupa as trocas de uma conversa.
-- Cada pessoa só vê as próprias conversas.
create table public.conversas_documento (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conversa uuid not null,
  chave text not null,                                   -- documento (id) ou roteiro de vídeo ("video:<id>")
  cliente_id uuid references public.clientes(id) on delete set null,
  pedido text not null,
  resposta text not null default '',
  passos jsonb not null default '[]'::jsonb,             -- cada um que respondeu: [{quem, etapa, texto}]
  selecao text,                                          -- trecho selecionado no documento
  citados jsonb not null default '[]'::jsonb,            -- documentos puxados com @: [{id, titulo}]
  erro text,
  inserido boolean not null default false,               -- a resposta foi inserida no documento
  created_at timestamptz not null default now()
);

create index conversas_documento_por_chave on public.conversas_documento (user_id, chave, created_at desc);

alter table public.conversas_documento enable row level security;

create policy conversas_documento_dono on public.conversas_documento
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.conversas_documento to authenticated;
