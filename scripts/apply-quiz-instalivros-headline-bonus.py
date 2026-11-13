"""Quiz do Instalivros (dccceb2d): headline grifada no topo da oferta e preço De/Por no Bônus 1.
Mexe só nesses campos, no rascunho (estrutura) e no publicado (estrutura_publicada); o resto do rascunho não vai junto.
`--testar` faz tudo e desfaz no fim (nada gravado)."""
import sys
from migration_db import connect

quiz = 'dccceb2d-e90d-4d86-be86-1aae7597de10'
headline = 'Termine ==1 livro== por dia e vire a pessoa mais ==interessante da mesa==.'
testar = '--testar' in sys.argv
c = connect()
q = c.cursor()
try:
    for col in ('estrutura', 'estrutura_publicada'):
        q.execute(f"""UPDATE quizzes SET {col} = jsonb_set(jsonb_set(jsonb_set({col},
            '{{oferta,headline}}', to_jsonb(%s::text)),
            '{{oferta,bonus,0,preco_de}}', '"R$297"'),
            '{{oferta,bonus,0,preco_por}}', '"R$0"')
            WHERE id = %s AND {col} #>> '{{oferta,bonus,0,titulo}}' LIKE 'BÔNUS 1%%'""", (headline, quiz))
        print(col, 'linhas', q.rowcount)
        if q.rowcount != 1:
            raise RuntimeError(f'{col}: quiz/bônus 1 não encontrado')
    q.execute("SELECT estrutura_publicada #>> '{oferta,headline}', estrutura_publicada #>> '{oferta,bonus,0,preco_de}' FROM quizzes WHERE id=%s", (quiz,))
    print(q.fetchone())
    if testar:
        c.rollback(); print('TESTADO (nada gravado)'); sys.exit(0)
    c.commit(); print('APLICADO')
except Exception as e:
    c.rollback(); print('FAILED', e); sys.exit(1)
finally:
    c.close()
