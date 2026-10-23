-- Headlines caracterizadas: cada pessoa grava e vê só as próprias; o mesmo texto é uma linha só (upsert).
BEGIN;
do $$
declare eu uuid := (select id from auth.users order by created_at limit 1);
declare outro uuid := (select id from auth.users where id <> eu order by created_at limit 1);
declare n int;
begin
  insert into public.headlines_caracterizadas (user_id, texto, tag) values (outro, 'headline do outro', 'lista');

  perform set_config('request.jwt.claims', json_build_object('sub', eu, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.headlines_caracterizadas (texto, tag, nicho, visualizacoes) values ('3 livros', 'lista', 'livros', 1000);
  insert into public.headlines_caracterizadas (texto, tag) values ('3 livros', 'curiosidade')
    on conflict (user_id, texto) do update set tag = excluded.tag;
  select count(*) into n from public.headlines_caracterizadas;
  if n <> 1 then raise exception 'devia ver só a própria (e uma linha só): viu %', n; end if;
  if (select tag from public.headlines_caracterizadas where texto = '3 livros') <> 'curiosidade' then raise exception 'upsert não trocou a tag'; end if;
  begin
    insert into public.headlines_caracterizadas (user_id, texto) values (outro, 'em nome do outro');
    raise exception 'devia bloquear gravar em nome de outra pessoa';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.headlines_caracterizadas (texto, visualizacoes) values ('negativa', -1);
    raise exception 'devia recusar visualizações negativas';
  exception when check_violation then null;
  end;
  reset role;
end $$;
ROLLBACK;
