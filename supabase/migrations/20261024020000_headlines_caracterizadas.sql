-- Headlines caracterizadas pelo Davi (24/10: "quando eu selecionar uma palavra, quero que apareça embaixo
-- tag, nicho, visualização; eu que vou preencher, depois a gente vai usar isso"). Uma linha por texto
-- (sem a numeração "1:" / "Headline 2:"), por pessoa; o documento e o projeto ficam como origem.
create table public.headlines_caracterizadas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  texto text not null check (length(btrim(texto)) > 0),
  tag text,
  nicho text,
  visualizacoes bigint check (visualizacoes is null or visualizacoes >= 0),
  documento_id uuid references public.documentos(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, texto)
);

alter table public.headlines_caracterizadas enable row level security;

create policy headlines_caracterizadas_dono on public.headlines_caracterizadas
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.headlines_caracterizadas to authenticated;
