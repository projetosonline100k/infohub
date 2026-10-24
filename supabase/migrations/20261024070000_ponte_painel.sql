-- Tela da Ponte (24/10, Davi): o app passa a VER a fila e APROVAR pedidos, mas só pelo login do Davi.
-- A tabela continua fechada (RLS sem policy, sem grant para anon/authenticated); o acesso é por duas funções
-- security definer que conferem, no servidor, se quem chama é o e-mail admin (o mesmo de src/lib/admin.ts).
-- Qualquer outro usuário recebe erro 42501. Não dá para criar, editar texto nem apagar pedido pelo app.
-- Pedido fdec9127: a tela (src/pages/Ponte.tsx) já está no código; este acesso esperou a confirmação do Davi.
-- Confirmado o caminho, só falta: python3 scripts/apply-ponte-painel-migration.py --testar e depois sem --testar.

create or replace function public.ponte_eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid() and lower(u.email) = 'eu.daviqueiroz22@gmail.com'
  );
$$;

create or replace function public.ponte_painel()
returns setof public.ponte_pedidos
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.ponte_eh_admin() then
    raise exception 'Só o administrador vê a ponte' using errcode = '42501';
  end if;
  return query select * from public.ponte_pedidos order by criado_em desc limit 200;
end;
$$;

create or replace function public.ponte_aprovar(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ponte_eh_admin() then
    raise exception 'Só o administrador aprova pedidos da ponte' using errcode = '42501';
  end if;
  update public.ponte_pedidos set aprovado = true
   where id = p_id and status in ('pendente', 'aguardando_aprovacao') and not aprovado;
  return found;
end;
$$;

revoke all on function public.ponte_eh_admin() from public, anon;
revoke all on function public.ponte_painel() from public, anon;
revoke all on function public.ponte_aprovar(uuid) from public, anon;
grant execute on function public.ponte_eh_admin() to authenticated;
grant execute on function public.ponte_painel() to authenticated;
grant execute on function public.ponte_aprovar(uuid) to authenticated;
