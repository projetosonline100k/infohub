"""Move tarefas sem pasta para uma pasta "Geral" recém-criada, agrupando por
cliente/dono, para não perder acesso a elas depois que a UI removeu a opção
"Sem pasta". Idempotente: só mexe em tarefas com pasta_id IS NULL."""
from migration_db import connect

c = connect()
try:
    q = c.cursor()
    q.execute("""
        SELECT cliente_id, user_id, array_agg(id) AS ids, count(*)
        FROM public.atividades
        WHERE pasta_id IS NULL AND deleted_at IS NULL
        GROUP BY cliente_id, user_id
    """)
    grupos = q.fetchall()
    if not grupos:
        print('NADA_PARA_MOVER')
    for cliente_id, user_id, ids, total in grupos:
        q.execute(
            "INSERT INTO public.pastas_atividade(nome, cliente_id, user_id) VALUES ('Geral', %s, %s) RETURNING id",
            (cliente_id, user_id),
        )
        pasta_id = q.fetchone()[0]
        q.execute(
            "UPDATE public.atividades SET pasta_id = %s WHERE id = ANY(%s)",
            (pasta_id, ids),
        )
        print('MOVIDO', total, 'tarefas para pasta', pasta_id, 'cliente', cliente_id, 'dono', user_id)
    c.commit()
    print('OK')
except Exception as e:
    c.rollback()
    d = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
    print('FAILED', d.get('C'), d.get('M'))
    raise
finally:
    c.close()
