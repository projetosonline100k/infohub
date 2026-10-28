-- 28/10 (Davi: "criei a atividade na quarta; no kanban da Core deveria cair na quarta também"): em projeto
-- cujas colunas são dias da semana (Core: Segunda-feira … Sexta-feira), o dia da tarefa e a coluna andam juntos.
--  * mudou a data (Semana, adiar, painel, agentes) → vai para a coluna daquele dia;
--  * mudou a coluna (kanban) → a data vira esse dia (o próximo, contando hoje);
--  * tarefa nova: com data, cai na coluna do dia; sem data numa coluna de dia, ganha a data.
-- Tarefa concluída ou na coluna de conclusão não mexe. Projeto sem colunas de dia: nada muda.

create or replace function public.dia_da_coluna(nome text) returns int
language sql immutable as $$
  select case
    when n like 'domingo%' then 0 when n like 'segunda%' then 1 when n like 'terca%' then 2
    when n like 'quarta%' then 3 when n like 'quinta%' then 4 when n like 'sexta%' then 5
    when n like 'sabado%' then 6 end
  from (select lower(translate(btrim(coalesce(nome, '')), 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc')) as n) x
$$;

create or replace function public.atividade_sincroniza_dia_coluna() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_coluna text;
  v_dia int;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if new.cliente_id is null or coalesce(new.concluida, false) then return new; end if;
  if exists (select 1 from colunas_atividade c where c.cliente_id = new.cliente_id and c.status_key = new.status and c.eh_conclusao) then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.data_vencimento is not distinct from old.data_vencimento
     and new.status is not distinct from old.status then
    return new;
  end if;

  -- A data manda: tarefa nova com data, ou a data mudou (sem mudar a coluna junto).
  if new.data_vencimento is not null
     and (tg_op = 'INSERT' or (new.data_vencimento is distinct from old.data_vencimento and new.status is not distinct from old.status)) then
    select c.status_key into v_coluna from colunas_atividade c
     where c.cliente_id = new.cliente_id and not c.eh_conclusao
       and dia_da_coluna(c.nome) = extract(dow from new.data_vencimento)::int
     order by c.ordem limit 1;
    if v_coluna is not null then new.status := v_coluna; end if;
    return new;
  end if;

  -- A coluna manda: mudou de coluna (sem mudar a data junto), ou tarefa nova sem data.
  select dia_da_coluna(c.nome) into v_dia from colunas_atividade c
   where c.cliente_id = new.cliente_id and c.status_key = new.status limit 1;
  if v_dia is not null and (new.data_vencimento is null or extract(dow from new.data_vencimento)::int <> v_dia) then
    new.data_vencimento := v_hoje + ((v_dia - extract(dow from v_hoje)::int + 7) % 7);
  end if;
  return new;
end $$;

drop trigger if exists trg_atividades_dia_coluna on public.atividades;
create trigger trg_atividades_dia_coluna
  before insert or update of data_vencimento, status on public.atividades
  for each row execute function public.atividade_sincroniza_dia_coluna();
