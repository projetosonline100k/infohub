-- Comentários também no roteiro dos vídeos (25/10, Davi selecionou texto no roteiro da Vertical e não apareceu
-- "Comentar"). O comentário pertence a um documento OU a um vídeo (videos_vertical); quem vê um ou outro comenta.
alter table public.documento_comentarios alter column documento_id drop not null;
alter table public.documento_comentarios add column if not exists video_id uuid references public.videos_vertical(id) on delete cascade;
alter table public.documento_comentarios drop constraint if exists documento_comentarios_um_alvo;
alter table public.documento_comentarios add constraint documento_comentarios_um_alvo
  check ((documento_id is not null)::int + (video_id is not null)::int = 1);
create index if not exists documento_comentarios_video on public.documento_comentarios (video_id, created_at) where video_id is not null;

-- "Enxerga o alvo": a própria RLS do documento ou do vídeo deixa ler a linha.
create or replace function public.comentario_alvo_visivel(p_documento uuid, p_video uuid)
returns boolean language sql stable set search_path to 'public' as $$
  select case
    when p_documento is not null then exists (select 1 from public.documentos d where d.id = p_documento)
    else exists (select 1 from public.videos_vertical v where v.id = p_video)
  end;
$$;

drop policy if exists documento_comentarios_ler on public.documento_comentarios;
create policy documento_comentarios_ler on public.documento_comentarios for select to authenticated
  using (public.comentario_alvo_visivel(documento_id, video_id));
drop policy if exists documento_comentarios_criar on public.documento_comentarios;
create policy documento_comentarios_criar on public.documento_comentarios for insert to authenticated
  with check (autor_id = auth.uid() and public.comentario_alvo_visivel(documento_id, video_id));
drop policy if exists documento_comentarios_mudar on public.documento_comentarios;
create policy documento_comentarios_mudar on public.documento_comentarios for update to authenticated
  using (public.comentario_alvo_visivel(documento_id, video_id))
  with check (public.comentario_alvo_visivel(documento_id, video_id));
drop policy if exists documento_comentarios_apagar on public.documento_comentarios;
create policy documento_comentarios_apagar on public.documento_comentarios for delete to authenticated
  using (autor_id = auth.uid()
    or exists (select 1 from public.documentos d where d.id = documento_id and d.user_id = auth.uid())
    or exists (select 1 from public.videos_vertical v where v.id = video_id and v.user_id = auth.uid()));
