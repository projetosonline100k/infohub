-- Conversas do chat do ⌘I: cada pessoa grava e vê só as próprias.
BEGIN;
do $$
declare eu uuid := (select id from auth.users order by created_at limit 1);
declare outro uuid := (select id from auth.users where id <> eu order by created_at limit 1);
declare n int;
begin
  -- Uma conversa de outra pessoa (gravada sem RLS).
  insert into public.conversas_documento (user_id, conversa, chave, pedido, resposta)
  values (outro, gen_random_uuid(), 'doc-teste', 'pedido do outro', 'resposta');

  perform set_config('request.jwt.claims', json_build_object('sub', eu, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.conversas_documento (conversa, chave, pedido, resposta, passos, citados)
  values (gen_random_uuid(), 'doc-teste', 'meu pedido', 'minha resposta', '[{"quem":"Junior","texto":"x"}]', '[{"id":"d","titulo":"T"}]')
  returning 1 into n;
  select count(*) into n from public.conversas_documento where chave = 'doc-teste';
  if n <> 1 then raise exception 'devia ver só a própria conversa (viu %)', n; end if;
  begin
    insert into public.conversas_documento (user_id, conversa, chave, pedido) values (outro, gen_random_uuid(), 'doc-teste', 'em nome do outro');
    raise exception 'devia bloquear gravar conversa em nome de outra pessoa';
  exception when insufficient_privilege then null;
  end;
  update public.conversas_documento set inserido = true where chave = 'doc-teste';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'devia atualizar só a própria (atualizou %)', n; end if;
  reset role;
end $$;
ROLLBACK;
