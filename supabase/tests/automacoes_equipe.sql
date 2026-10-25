BEGIN;
-- Automações na equipe: com a área liberada o membro vê e cria (no nome do dono); sem ela, não vê nada.
do $$
declare con record;
declare membro record;
declare item uuid;
declare dono_item uuid;
declare n int;
begin
  select ig_user_id, user_id, cliente_id into con from public.instagram_conexoes where cliente_id is not null limit 1;
  if con.ig_user_id is null then return; end if;
  select id, lower(email) as email into membro from auth.users where id <> con.user_id and email_confirmed_at is not null order by created_at limit 1;
  if membro.id is null then return; end if;
  -- A equipe só é mexida pelo dono do projeto (gatilho): faz isso como ele.
  perform set_config('request.jwt.claims', json_build_object('sub', con.user_id, 'role', 'authenticated')::text, true);
  delete from public.equipe_cliente where cliente_id = con.cliente_id and email = membro.email;
  insert into public.equipe_cliente (cliente_id, nome_pessoa, papel, email, clientes_permitidos, permissoes, user_id)
    values (con.cliente_id, 'Teste', 'Copy', membro.email, '{}', '{"automacoes": {"acessar": true, "criar": true, "editar": true}}', con.user_id);

  perform set_config('request.jwt.claims', json_build_object('sub', membro.id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.instagram_contas() where ig_user_id = con.ig_user_id;
  if n <> 1 then raise exception 'membro com a área devia ver a conta do projeto'; end if;
  insert into public.instagram_automacoes (nome, palavras_chave, mensagem_dm, ig_user_id, user_id)
    values ('Teste equipe', array['teste'], 'oi', con.ig_user_id, membro.id) returning id, user_id into item, dono_item;
  if dono_item <> con.user_id then raise exception 'a automação devia ficar no nome do dono da conta'; end if;
  update public.instagram_automacoes set nome = 'Teste equipe 2' where id = item;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', con.user_id, 'role', 'authenticated')::text, true);
  update public.equipe_cliente set permissoes = '{"automacoes": {"acessar": false, "criar": false, "editar": false}}' where cliente_id = con.cliente_id and email = membro.email;
  perform set_config('request.jwt.claims', json_build_object('sub', membro.id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.instagram_automacoes where id = item;
  if n <> 0 then raise exception 'sem a área o membro não devia ver a automação'; end if;
  select count(*) into n from public.instagram_contas() where ig_user_id = con.ig_user_id;
  if n <> 0 then raise exception 'sem a área o membro não devia ver a conta'; end if;
  reset role;
end $$;
ROLLBACK;
