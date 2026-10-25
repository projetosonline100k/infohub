-- Comentários nos documentos, como no Google Docs (25/10, Davi: "ao selecionar uma palavra, a opção de adicionar
-- um comentário"). O trecho comentado fica marcado no próprio texto (marca "comentario" com o id); aqui ficam o
-- texto do comentário, as respostas (parent_id) e se foi resolvido. Quem enxerga o documento enxerga e comenta;
-- apagar, só quem escreveu (ou o dono do documento).
create table if not exists public.documento_comentarios (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.documentos(id) on delete cascade,
  parent_id uuid references public.documento_comentarios(id) on delete cascade,
  autor_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  autor_nome text,
  trecho text,
  texto text not null check (length(btrim(texto)) > 0),
  resolvido boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists documento_comentarios_doc on public.documento_comentarios (documento_id, created_at);

alter table public.documento_comentarios enable row level security;

-- "Enxerga o documento" = a própria RLS de documentos deixa ler a linha.
create policy documento_comentarios_ler on public.documento_comentarios for select to authenticated
  using (exists (select 1 from public.documentos d where d.id = documento_id));
create policy documento_comentarios_criar on public.documento_comentarios for insert to authenticated
  with check (autor_id = auth.uid() and exists (select 1 from public.documentos d where d.id = documento_id));
create policy documento_comentarios_mudar on public.documento_comentarios for update to authenticated
  using (exists (select 1 from public.documentos d where d.id = documento_id))
  with check (exists (select 1 from public.documentos d where d.id = documento_id));
create policy documento_comentarios_apagar on public.documento_comentarios for delete to authenticated
  using (autor_id = auth.uid() or exists (select 1 from public.documentos d where d.id = documento_id and d.user_id = auth.uid()));

grant select, insert, update, delete on public.documento_comentarios to authenticated;
