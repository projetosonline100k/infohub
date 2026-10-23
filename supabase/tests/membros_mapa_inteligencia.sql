-- Mapa da inteligência: aceita {pilares: [...]} e recusa outro formato.
BEGIN;
do $$
declare m uuid;
begin
  select id into m from public.membros limit 1;
  update public.membros set mapa_inteligencia = '{"titulo":"Junior","pilares":[{"titulo":"Headline","itens":["Gatilho forte"]}]}' where id = m;
  begin
    update public.membros set mapa_inteligencia = '[1,2]' where id = m;
    raise exception 'aceitou mapa que não é objeto';
  exception when check_violation then null;
  end;
  begin
    update public.membros set mapa_inteligencia = '{"titulo":"sem pilares"}' where id = m;
    raise exception 'aceitou mapa sem pilares';
  exception when check_violation then null;
  end;
end $$;
ROLLBACK;
