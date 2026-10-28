"""28/10: desfaz o efeito do gatilho trg_atividades_dia_coluna (versão 20261028020000), que mandou para segunda
(02/11) tarefas trocadas de projeto hoje. Volta as três para hoje (o gatilho põe na coluna do dia) e manda para a
lixeira (deleted_at) a cópia repetida de "20 roteiros da Royal Defense". Pedido do Davi no chat."""
from migration_db import connect

VOLTAR = ["37cad466-cecf-41d6-80c0-597ce0782720", "986a86c0-a2ca-4c0a-ba4c-ffbad0e9ef1f", "fb651552-93e8-4165-9501-c0e5eaf0e77e"]
REPETIDA = "986a86c0-a2ca-4c0a-ba4c-ffbad0e9ef1f"

c = connect()
q = c.cursor()
q.execute("""UPDATE public.atividades SET data_vencimento = '2026-10-28'
              WHERE id = ANY(%s::uuid[]) AND data_vencimento = '2026-11-02' AND NOT concluida
              RETURNING titulo, status""", (VOLTAR,))
for linha in q.fetchall():
    print("voltou para hoje:", linha)
q.execute("UPDATE public.atividades SET deleted_at = now() WHERE id = %s AND deleted_at IS NULL RETURNING titulo", (REPETIDA,))
print("lixeira:", q.fetchall())
c.commit()
