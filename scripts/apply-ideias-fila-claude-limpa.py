"""Tira da fila da sessão "Inteligência do Infopro" os pedidos /ideia antigos
(o "Separar ideias" agora roda no próprio Jarvis). Evita que a sessão, ao
voltar, acrescente as mesmas ideias de novo no doc do mentorado."""
from migration_db import connect

c = connect()
q = c.cursor()
q.execute("""update jarvis_conversa set status = 'respondida'
             where papel = 'davi' and texto like '/ideia %' and status in ('enviada', 'lida')""")
print(q.rowcount, "pedidos /ideia retirados da fila")
c.commit()
