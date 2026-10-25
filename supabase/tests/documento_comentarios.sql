BEGIN;
-- Comentários: quem vê o documento comenta; quem não vê não lê nem comenta; responder e resolver funcionam.
do $$
declare dono uuid;
declare outro uuid;
declare doc uuid;
declare com uuid;
declare n int;
begin
  select id into dono from auth.users order by created_at limit 1;
  select id into outro from auth.users where id <> dono order by created_at limit 1;
  -- O documento nasce do próprio dono (o gatilho carimba o dono pela sessão).
  perform set_config('request.jwt.claims', json_build_object('sub', dono, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.documentos (titulo, conteudo) values ('Teste comentários', '<p>oi</p>') returning id into doc;
  insert into public.documento_comentarios (documento_id, trecho, texto) values (doc, 'oi', 'Trocar esta palavra') returning id into com;
  insert into public.documento_comentarios (documento_id, parent_id, texto) values (doc, com, 'Resposta');
  update public.documento_comentarios set resolvido = true where id = com;
  select count(*) into n from public.documento_comentarios where documento_id = doc;
  if n <> 2 then raise exception 'dono devia ver 2 comentários, viu %', n; end if;
  begin
    insert into public.documento_comentarios (documento_id, texto) values (doc, '   ');
    raise exception 'comentário vazio devia falhar';
  exception when check_violation then null;
  end;
  reset role;

  if outro is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', outro, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.documento_comentarios where documento_id = doc;
    if n <> 0 then raise exception 'quem não vê o documento não devia ver os comentários (viu %)', n; end if;
    begin
      insert into public.documento_comentarios (documento_id, texto) values (doc, 'intruso');
      raise exception 'quem não vê o documento não devia comentar';
    exception when insufficient_privilege then null;
    end;
    reset role;
  end if;
end $$;
ROLLBACK;
