BEGIN;
-- Usuário autenticado envia na própria pasta, não na de outro.
do $$
declare eu uuid := (select id from auth.users order by created_at limit 1);
declare outro uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claims', json_build_object('sub', eu, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into storage.objects (bucket_id, name, owner) values ('capas-referencia', eu || '/teste.jpg', eu);
  begin
    insert into storage.objects (bucket_id, name, owner) values ('capas-referencia', outro || '/teste.jpg', eu);
    raise exception 'devia bloquear envio na pasta de outro usuário';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
ROLLBACK;
