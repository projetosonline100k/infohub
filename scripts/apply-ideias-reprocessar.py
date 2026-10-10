"""Volta pra "pendente" as ideias do Separar ideias que falharam só porque o
tradutor não respondeu — o Jarvis tenta de novo sozinho."""
from migration_db import connect

c = connect()
q = c.cursor()
q.execute("update creator_ideias set status = 'pendente', erro = null where status = 'erro' and erro like 'O tradutor%'")
print(q.rowcount, "ideias voltaram pra fila")
c.commit()
