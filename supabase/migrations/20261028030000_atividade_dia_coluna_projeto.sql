-- 28/10: trocar o projeto de uma tarefa (ela entra na 1ª coluna do projeto novo — na Core, "Segunda-feira")
-- era lido como "arrastou para segunda" e a data pulava para a próxima segunda (a tarefa sumia do dia).
-- Agora, mudando o projeto, a data manda: a tarefa vai para a coluna do dia dela.
create or replace function public.atividade_sincroniza_dia_coluna() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_coluna text;
  v_dia int;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mudou_projeto boolean := tg_op = 'UPDATE' and new.cliente_id is distinct from old.cliente_id;
begin
  if new.cliente_id is null or coalesce(new.concluida, false) then return new; end if;
  if exists (select 1 from colunas_atividade c where c.cliente_id = new.cliente_id and c.status_key = new.status and c.eh_conclusao) then
    return new;
  end if;

  if tg_op = 'UPDATE' and not v_mudou_projeto and new.data_vencimento is not distinct from old.data_vencimento
     and new.status is not distinct from old.status then
    return new;
  end if;

  -- A data manda: tarefa nova com data, projeto trocado, ou a data mudou (sem mudar a coluna junto).
  if new.data_vencimento is not null
     and (tg_op = 'INSERT' or v_mudou_projeto
          or (new.data_vencimento is distinct from old.data_vencimento and new.status is not distinct from old.status)) then
    select c.status_key into v_coluna from colunas_atividade c
     where c.cliente_id = new.cliente_id and not c.eh_conclusao
       and dia_da_coluna(c.nome) = extract(dow from new.data_vencimento)::int
     order by c.ordem limit 1;
    if v_coluna is not null then new.status := v_coluna; end if;
    return new;
  end if;

  -- A coluna manda: mudou de coluna (sem mudar a data junto), ou tarefa sem data.
  select dia_da_coluna(c.nome) into v_dia from colunas_atividade c
   where c.cliente_id = new.cliente_id and c.status_key = new.status limit 1;
  if v_dia is not null and (new.data_vencimento is null or extract(dow from new.data_vencimento)::int <> v_dia) then
    new.data_vencimento := v_hoje + ((v_dia - extract(dow from v_hoje)::int + 7) % 7);
  end if;
  return new;
end $$;

drop trigger if exists trg_atividades_dia_coluna on public.atividades;
create trigger trg_atividades_dia_coluna
  before insert or update of data_vencimento, status, cliente_id on public.atividades
  for each row execute function public.atividade_sincroniza_dia_coluna();
