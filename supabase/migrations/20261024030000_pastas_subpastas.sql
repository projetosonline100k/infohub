-- Pasta dentro de pasta (24/10, Davi: "queria conseguir criar uma pasta dentro de outra pasta").
-- `parent_id` aponta para a pasta-mãe (do mesmo projeto e da mesma origem); sem mãe = pasta de cima.
alter table public.pastas_atividade
  add column if not exists parent_id uuid references public.pastas_atividade(id) on delete cascade;

create index if not exists pastas_atividade_parent_idx on public.pastas_atividade (parent_id);

-- A mãe tem que ser do mesmo projeto e da mesma origem, e uma pasta não pode ficar dentro dela mesma
-- (nem de uma filha dela).
create or replace function public.pastas_atividade_valida_mae()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  atual uuid := new.parent_id;
  passos int := 0;
begin
  if new.parent_id is null then return new; end if;
  if not exists (
    select 1 from public.pastas_atividade m
    where m.id = new.parent_id and m.cliente_id is not distinct from new.cliente_id and m.origem = new.origem
  ) then
    raise exception 'a pasta-mãe tem que ser do mesmo projeto' using errcode = 'check_violation';
  end if;
  while atual is not null and passos < 50 loop
    if atual = new.id then
      raise exception 'uma pasta não pode ficar dentro dela mesma' using errcode = 'check_violation';
    end if;
    select parent_id into atual from public.pastas_atividade where id = atual;
    passos := passos + 1;
  end loop;
  return new;
end $$;

drop trigger if exists pastas_atividade_valida_mae on public.pastas_atividade;
create trigger pastas_atividade_valida_mae
  before insert or update of parent_id on public.pastas_atividade
  for each row execute function public.pastas_atividade_valida_mae();
