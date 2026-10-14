"""13/10/2026: a integração com o app Lembretes (já desligada) recriou como
atividades novas as tarefas que estavam nas listas "Infopro" dos Lembretes,
entre 19:56 e 19:59 UTC — e já tinha acontecido em 05/10, 09:29–09:35 UTC. Manda pra lixeira (deleted_at) só as que são cópia
de uma atividade que já existia (mesmo título, mesmo projeto, criada antes).
Recuperável pela lixeira."""
from migration_db import connect

c = connect()
q = c.cursor()
for inicio, fim, so_com_lembrete in (("2026-10-13 19:56+00", "2026-10-13 19:59+00", True),
                                    ("2026-10-05 09:29+00", "2026-10-05 09:35+00", False)):
    q.execute(f"""UPDATE public.atividades n SET deleted_at = now()
                  WHERE n.created_at BETWEEN %s AND %s
                    {"AND n.alarme_lembrete_id IS NOT NULL" if so_com_lembrete else ""} AND n.deleted_at IS NULL
                    AND EXISTS (SELECT 1 FROM public.atividades o
                                WHERE o.titulo = n.titulo
                                  AND coalesce(o.cliente_id::text, '') = coalesce(n.cliente_id::text, '')
                                  AND o.created_at < %s)""", (inicio, fim, inicio))
    print(inicio[:10], q.rowcount, "cópias enviadas pra lixeira")
c.commit()
