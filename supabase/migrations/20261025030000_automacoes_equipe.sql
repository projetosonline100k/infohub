-- Automações na permissão da equipe (25/10, Davi: "adicione automação" na tela de permissões do membro).
-- Quem tem a área "automacoes" num projeto passa a ver (acessar), criar e editar as automações das contas do
-- Instagram ligadas àquele projeto. As conexões (tokens) continuam fechadas: a checagem passa por uma função
-- SECURITY DEFINER. Automação criada por alguém da equipe fica no nome do dono da conta (o robô do Instagram
-- só dispara as do dono — supabase/functions/instagram-automacoes).

create or replace function public.instagram_conta_permite(p_ig_user_id text, p_acao text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.instagram_conexoes c
    where c.ig_user_id = p_ig_user_id
      and (c.user_id = auth.uid() or (c.cliente_id is not null and public.team_allowed(c.cliente_id, 'automacoes', p_acao)))
  );
$$;
revoke all on function public.instagram_conta_permite(text, text) from public, anon;
grant execute on function public.instagram_conta_permite(text, text) to authenticated;

-- Dono da automação = dono da conta conectada.
create or replace function public.instagram_automacao_dono()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare dono uuid;
begin
  select user_id into dono from public.instagram_conexoes where ig_user_id = new.ig_user_id;
  if dono is not null then new.user_id := dono; end if;
  return new;
end;
$$;
drop trigger if exists instagram_automacao_dono on public.instagram_automacoes;
create trigger instagram_automacao_dono before insert or update of ig_user_id on public.instagram_automacoes
  for each row execute function public.instagram_automacao_dono();

drop policy if exists equipe_le on public.instagram_automacoes;
create policy equipe_le on public.instagram_automacoes for select to authenticated
  using (public.instagram_conta_permite(ig_user_id, 'acessar'));
drop policy if exists equipe_cria on public.instagram_automacoes;
create policy equipe_cria on public.instagram_automacoes for insert to authenticated
  with check (public.instagram_conta_permite(ig_user_id, 'criar'));
drop policy if exists equipe_edita on public.instagram_automacoes;
create policy equipe_edita on public.instagram_automacoes for update to authenticated
  using (public.instagram_conta_permite(ig_user_id, 'editar'))
  with check (public.instagram_conta_permite(ig_user_id, 'editar'));
drop policy if exists equipe_apaga on public.instagram_automacoes;
create policy equipe_apaga on public.instagram_automacoes for delete to authenticated
  using (public.instagram_conta_permite(ig_user_id, 'editar'));

drop policy if exists equipe_le on public.instagram_automacao_disparos;
create policy equipe_le on public.instagram_automacao_disparos for select to authenticated
  using (public.instagram_conta_permite(ig_user_id, 'acessar'));

-- Contas que aparecem na tela de Automações: as minhas e as dos projetos em que tenho a área liberada.
create or replace function public.instagram_contas()
 returns table(ig_user_id text, username text, token_expira_em timestamp with time zone, cliente_id uuid, cliente_nome text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select c.ig_user_id, c.username, c.token_expira_em, c.cliente_id, cl.nome_especialista
  from public.instagram_conexoes c
  left join public.clientes cl on cl.id = c.cliente_id
  where c.user_id = auth.uid()
     or (c.cliente_id is not null and public.team_allowed(c.cliente_id, 'automacoes', 'acessar'))
  order by c.cliente_id nulls first, c.criado_em
$function$;

-- A área nova entra na lista de áreas válidas da equipe.
CREATE OR REPLACE FUNCTION public.validate_team_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE owner_id uuid; area text; permission jsonb;
BEGIN
  SELECT user_id INTO owner_id FROM public.clientes WHERE id = NEW.cliente_id;
  IF owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Somente o proprietário pode gerenciar a equipe'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(NEW.clientes_permitidos) selected(id)
    LEFT JOIN public.clientes c ON c.id = selected.id
    WHERE c.id IS NULL OR c.user_id IS DISTINCT FROM owner_id) THEN
    RAISE EXCEPTION 'Cliente não pertence à mesma conta';
  END IF;
  IF jsonb_typeof(NEW.permissoes) <> 'object' THEN RAISE EXCEPTION 'Permissões inválidas'; END IF;
  FOR area, permission IN SELECT * FROM jsonb_each(NEW.permissoes) LOOP
    IF area NOT IN ('clientes', 'pesquisa', 'documentos', 'conteudo', 'atividades', 'produtos', 'automacoes')
      OR jsonb_typeof(permission) <> 'object' THEN RAISE EXCEPTION 'Área inválida'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(permission) p WHERE p.key NOT IN ('acessar','criar','editar') OR jsonb_typeof(p.value) <> 'boolean') THEN
      RAISE EXCEPTION 'Permissão inválida';
    END IF;
    IF (permission->>'criar' = 'true' OR permission->>'editar' = 'true') AND permission->>'acessar' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Criar e editar exigem acesso';
    END IF;
  END LOOP;
  NEW.email := nullif(lower(trim(NEW.email)), '');
  NEW.user_id := owner_id;
  RETURN NEW;
END;
$function$;
