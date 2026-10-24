BEGIN;
-- Ponte: padrões do pedido e ninguém do app (anon/authenticated) enxerga a fila.
do $$
declare p public.ponte_pedidos;
declare eu uuid := (select id from auth.users order by created_at limit 1);
declare n int;
begin
  insert into public.ponte_pedidos (titulo, descricao) values ('Teste', 'descrição') returning * into p;
  if p.status <> 'pendente' or p.prioridade <> 'normal' or p.origem <> 'claude_voz' or not p.requer_aprovacao or p.aprovado then
    raise exception 'padrões errados: %', row_to_json(p);
  end if;
  begin
    insert into public.ponte_pedidos (titulo, descricao, prioridade) values ('x', 'y', 'urgente');
    raise exception 'devia recusar prioridade fora da lista';
  exception when check_violation then null;
  end;
  begin
    insert into public.ponte_pedidos (titulo, descricao) values ('  ', 'y');
    raise exception 'devia recusar título vazio';
  exception when check_violation then null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', eu, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    select count(*) into n from public.ponte_pedidos;
    raise exception 'usuário do app não devia ler a fila (leu % linhas)', n;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ponte_pedidos (titulo, descricao) values ('x', 'y');
    raise exception 'usuário do app não devia gravar na fila';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
ROLLBACK;
