-- Alarme por atividade: horário em que avisa (no app e, no desktop, num
-- lembrete do app Lembretes do macOS) e o id desse lembrete, pra conseguir
-- atualizar/remover quando o alarme muda ou é desligado.
alter table public.atividades add column if not exists alarme_em timestamptz;
alter table public.atividades add column if not exists alarme_lembrete_id text;

create index if not exists atividades_alarme_em_idx
  on public.atividades (alarme_em)
  where alarme_em is not null and deleted_at is null;
