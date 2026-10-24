BEGIN;
-- Tela da Ponte: só o login do Davi lê a fila e aprova; outros usuários e o público não; a tabela segue fechada.
do $$
declare admin uuid := (select id from auth.users where lower(email) = 'eu.daviqueiroz22@gmail.com' limit 1);
declare outro uuid := (select id from auth.users where lower(email) <> 'eu.daviqueiroz22@gmail.com' order by created_at limit 1);
declare p uuid;
declare n int;
declare ok boolean;
begin
  insert into public.ponte_pedidos (titulo, descricao, status) values ('Teste painel', 'descrição', 'aguardando_aprovacao') returning id into p;

  if outro is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', outro, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform * from public.ponte_painel();
      raise exception 'outro usuário não devia ver a fila';
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.ponte_aprovar(p);
      raise exception 'outro usuário não devia aprovar';
    exception when insufficient_privilege then null;
    end;
    begin
      select count(*) into n from public.ponte_pedidos;
      raise exception 'a tabela devia continuar fechada (leu % linhas)', n;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end if;

  set local role anon;
  begin
    perform * from public.ponte_painel();
    raise exception 'anônimo não devia ver a fila';
  exception when insufficient_privilege then null;
  end;
  reset role;

  if admin is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
    set local role authenticated;
    if not exists (select 1 from public.ponte_painel() where id = p) then
      raise exception 'o Davi devia ver o pedido';
    end if;
    ok := public.ponte_aprovar(p);
    if not ok then raise exception 'o Davi devia conseguir aprovar'; end if;
    if public.ponte_aprovar(p) then raise exception 'aprovar de novo não devia mudar nada'; end if;
    begin
      update public.ponte_pedidos set titulo = 'x' where id = p;
      raise exception 'nem o Davi edita a tabela direto pelo app';
    exception when insufficient_privilege then null;
    end;
    reset role;
    if not (select aprovado from public.ponte_pedidos where id = p) then
      raise exception 'aprovado devia ter ficado true';
    end if;
  end if;
end $$;
ROLLBACK;
