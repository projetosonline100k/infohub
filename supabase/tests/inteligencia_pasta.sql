BEGIN;
-- Pasta ao vivo: tipo 'pasta' exige pasta_id (e só ele usa); o dono do projeto grava pelo app.
do $$
declare c record;
declare pasta uuid;
declare item uuid;
begin
  select id, user_id into c from public.clientes order by created_at limit 1;
  insert into public.pastas_atividade (cliente_id, nome, origem, ordem) values (c.id, 'Teste pasta ao vivo', 'documentos', 0) returning id into pasta;

  perform set_config('request.jwt.claims', json_build_object('sub', c.user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.inteligencia_membros (cliente_id, agente, escopo, tipo, nome, status, pasta_id)
    values (c.id, 'teste', 'projeto', 'pasta', 'Pasta: Teste', 'pronto', pasta) returning id into item;
  if item is null then raise exception 'dono devia conseguir conectar a pasta'; end if;
  begin
    insert into public.inteligencia_membros (cliente_id, agente, escopo, tipo, nome, status) values (c.id, 'teste', 'projeto', 'pasta', 'Sem pasta', 'pronto');
    raise exception 'tipo pasta sem pasta_id devia falhar';
  exception when check_violation then null;
  end;
  begin
    insert into public.inteligencia_membros (cliente_id, agente, escopo, tipo, nome, status, conteudo, pasta_id) values (c.id, 'teste', 'projeto', 'texto', 'Texto', 'pronto', 'x', pasta);
    raise exception 'texto com pasta_id devia falhar';
  exception when check_violation then null;
  end;
  reset role;
end $$;
ROLLBACK;
