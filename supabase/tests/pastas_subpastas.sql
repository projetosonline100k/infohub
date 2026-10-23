-- Pasta dentro de pasta: filha no mesmo projeto funciona; mãe de outro projeto e ciclo são recusados.
BEGIN;
do $$
declare c1 uuid; c2 uuid; mae uuid; filha uuid; outra uuid;
begin
  select id into c1 from public.clientes order by created_at limit 1;
  select id into c2 from public.clientes where id <> c1 order by created_at limit 1;
  insert into public.pastas_atividade (cliente_id, nome, origem, ordem) values (c1, 'Mãe', 'documentos', 0) returning id into mae;
  insert into public.pastas_atividade (cliente_id, nome, origem, ordem, parent_id) values (c1, 'Filha', 'documentos', 0, mae) returning id into filha;
  insert into public.pastas_atividade (cliente_id, nome, origem, ordem) values (c2, 'Outro projeto', 'documentos', 0) returning id into outra;
  begin
    update public.pastas_atividade set parent_id = outra where id = filha;
    raise exception 'aceitou mãe de outro projeto';
  exception when check_violation then null;
  end;
  begin
    update public.pastas_atividade set parent_id = filha where id = mae;
    raise exception 'aceitou ciclo (mãe dentro da filha)';
  exception when check_violation then null;
  end;
  delete from public.pastas_atividade where id = mae;
  if exists (select 1 from public.pastas_atividade where id = filha) then raise exception 'apagar a mãe devia levar a filha'; end if;
end $$;
ROLLBACK;
